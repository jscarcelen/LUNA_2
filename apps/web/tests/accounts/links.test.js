import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return {
    createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }),
    listWorkspaceTree: async () => []
  };
});

const repo = await import("../../lib/accountsRepository.js");
const { LinkError, isSetupNeededError } = await import("../../lib/accountsCore.js");

const account = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, ...over });
let teacher;
let student;
let parent;

beforeEach(() => {
  db.reset();
  repo.resetSharingCache();
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  student = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  parent = account({ email: "elena@home.com", display_name: "Elena", role: "parent" });
});

const links = () => db.table("account_links");

describe("asking to connect", () => {
  it("creates a pending request that is not yet a link", async () => {
    const result = await repo.requestLink(teacher, { email: " Maria@Home.com ", relation: "student" });
    expect(result.status).toBe("pending");
    expect(links()).toHaveLength(1);
    expect(links()[0]).toMatchObject({ kind: "teacher_student", requester_id: teacher.id, target_id: student.id, target_email: "maria@home.com", status: "pending" });
  });

  it("keeps a request for someone without an account, and hands it over when they sign up", async () => {
    await repo.requestLink(teacher, { email: "new.kid@home.com", relation: "student" });
    expect(links()[0]).toMatchObject({ target_id: null, status: "pending" });

    const kid = account({ email: "new.kid@home.com", display_name: "New Kid", role: "student" });
    expect(await repo.attachPendingLinks(kid)).toBe(1);
    expect(links()[0]).toMatchObject({ target_id: kid.id, status: "pending" });

    const connections = await repo.listConnections(kid);
    expect(connections.incoming).toHaveLength(1);
    expect(connections.incoming[0].other).toMatchObject({ displayName: "Prof. Rivera", role: "teacher", email: "rivera@school.edu" });
  });

  it("settles the kind from the real roles when the person signs up (a 'student' who signed up as a parent is a peer, with no student powers)", async () => {
    await repo.requestLink(teacher, { email: "dad@home.com", relation: "student" });
    expect(links()[0].kind).toBe("teacher_student");
    const dad = account({ email: "dad@home.com", display_name: "Dad", role: "parent" });
    await repo.attachPendingLinks(dad);
    expect(links()[0]).toMatchObject({ status: "pending", kind: "peer", target_id: dad.id, pair_key: "peer:dad@home.com|rivera@school.edu" });
    expect((await repo.listConnections(dad)).incoming).toHaveLength(1);
  });

  it("drops a waiting request that would have to be a peer connection when the sharing migration is missing", async () => {
    await repo.requestLink(teacher, { email: "dad@home.com", relation: "student" });
    db.drop("share_grants");
    repo.resetSharingCache();
    const dad = account({ email: "dad@home.com", display_name: "Dad", role: "parent" });
    await repo.attachPendingLinks(dad);
    expect(links()[0].status).toBe("revoked");
  });

  it("is active only after the other side accepts", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    const link = links()[0];
    expect(await repo.getAcceptedLink(teacher.id, student.id)).toBeNull();
    await expect(repo.changeLink(teacher, link.id, "accept")).rejects.toThrow(/Only the person who was asked/);
    expect(await repo.changeLink(student, link.id, "accept")).toBe("accepted");
    expect(await repo.getAcceptedLink(teacher.id, student.id)).toMatchObject({ kind: "teacher_student", status: "accepted" });
    expect(await repo.getAcceptedLink(student.id, teacher.id)).not.toBeNull();
  });

  it("lets a waiting request be accepted by the account whose email it names, even before it was attached", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    db.table("account_links")[0].target_id = null; // as if the account had been created without picking it up
    expect(await repo.changeLink(student, links()[0].id, "accept")).toBe("accepted");
    expect(links()[0].target_id).toBe(student.id);
  });

  it("is two-way: asking someone who already asked you is the second yes", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    const result = await repo.requestLink(student, { email: teacher.email, relation: "teacher" });
    expect(result.status).toBe("accepted");
    expect(links()).toHaveLength(1);
    expect(links()[0].status).toBe("accepted");
  });

  it("does not duplicate a repeated request", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    expect(links()).toHaveLength(1);
  });

  it("is an open network: any role can ask any role, and the kind comes from the two roles", async () => {
    const tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
    const ana = account({ email: "ana@school.edu", display_name: "Ana", role: "teacher" });
    const dan = account({ email: "dan@home.com", display_name: "Dan", role: "parent" });
    await repo.requestLink(teacher, { email: parent.email });            // teacher -> parent
    await repo.requestLink(parent, { email: dan.email });                // parent -> parent
    await repo.requestLink(student, { email: tom.email });               // student -> student
    await repo.requestLink(teacher, { email: ana.email, relation: "student" }); // the hint is only a hint: they are really a teacher
    await repo.requestLink(teacher, { email: student.email });           // teacher -> student, no hint needed
    await repo.requestLink(student, { email: parent.email });            // student -> parent
    const kinds = Object.fromEntries(links().map((row) => [`${row.requester_email}>${row.target_email}`, row.kind]));
    expect(kinds).toEqual({
      [`${teacher.email}>${parent.email}`]: "peer",
      [`${parent.email}>${dan.email}`]: "peer",
      [`${student.email}>${tom.email}`]: "peer",
      [`${teacher.email}>${ana.email}`]: "peer",
      [`${teacher.email}>${student.email}`]: "teacher_student",
      [`${student.email}>${parent.email}`]: "parent_student"
    });
  });

  it("still needs both sides, with no limit on how many connections you build", async () => {
    const others = Array.from({ length: 12 }, (_, index) => account({ email: `peer${index}@home.com`, display_name: `Peer ${index}`, role: index % 2 ? "student" : "teacher" }));
    for (const other of others) {
      await repo.requestLink(student, { email: other.email });
      const row = links().find((entry) => entry.target_id === other.id);
      expect(row.status).toBe("pending");
      await repo.changeLink(other, row.id, "accept");
    }
    expect(await repo.listConnectedIds(student.id)).toEqual(new Set(others.map((other) => other.id)));
    expect((await repo.listConnections(student)).accepted).toHaveLength(12);
  });

  it("peer requests follow the same two-way state machine and cooldown", async () => {
    const tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
    await repo.requestLink(student, { email: tom.email });
    const row = links()[0];
    expect(await repo.getAcceptedLink(student.id, tom.id)).toBeNull();
    await expect(repo.changeLink(student, row.id, "accept")).rejects.toThrow(/Only the person who was asked/);
    expect(await repo.changeLink(tom, row.id, "decline")).toBe("declined");
    await repo.requestLink(student, { email: tom.email }); // inside the 24 h cooldown: nothing changes
    expect(links()[0].status).toBe("declined");
    // asking back is the second yes
    const back = await repo.requestLink(tom, { email: student.email });
    expect(back.status).toBe("pending");
    expect(await repo.changeLink(student, links()[0].id, "accept")).toBe("accepted");
    expect(await repo.getAcceptedLink(tom.id, student.id)).toMatchObject({ kind: "peer", status: "accepted" });
    expect(await repo.changeLink(tom, links()[0].id, "remove")).toBe("revoked");
  });

  it("a peer connection never shows a student's performance; teacher_student does", async () => {
    const ana = account({ email: "ana@school.edu", display_name: "Ana", role: "teacher" });
    const tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
    for (const [from, to] of [[ana, tom], [student, tom], [teacher, student]]) {
      await repo.requestLink(from, { email: to.email });
      const row = links().find((entry) => entry.requester_id === from.id && entry.target_id === to.id);
      await repo.changeLink(to, row.id, "accept");
    }
    expect(await repo.linkedStudentWorkspaces(student, tom.id)).toBeNull(); // student -> student
    expect(await repo.linkedStudentWorkspaces(teacher, student.id)).not.toBeNull(); // real teacher_student link
    expect(await repo.linkedStudentWorkspaces(ana, tom.id)).not.toBeNull();
    // a teacher who is only a peer of a student (forced here) sees nothing
    links().find((entry) => entry.requester_id === ana.id).kind = "peer";
    expect(await repo.linkedStudentWorkspaces(ana, tom.id)).toBeNull();
  });

  it("answers the same whether the email has no account or an account with another role", async () => {
    const unknown = await repo.requestLink(teacher, { email: "ghost@nowhere.com", relation: "student" });
    const parentAsked = await repo.requestLink(teacher, { email: parent.email, relation: "student" });
    expect(parentAsked).toEqual(unknown);
  });

  it("explains a missing migration for connections that are not teacher/parent <-> student, and keeps the classic ones working", async () => {
    db.drop("share_grants");
    repo.resetSharingCache();
    const tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
    await expect(repo.requestLink(student, { email: tom.email })).rejects.toMatchObject({ status: 503, code: "setup_needed", setup: { setupNeeded: true, migration: expect.stringContaining("202610060001") } });
    await expect(repo.requestLink(teacher, { email: parent.email })).rejects.toMatchObject({ status: 503 });
    expect(links()).toHaveLength(0);
    expect((await repo.requestLink(teacher, { email: student.email, relation: "student" })).status).toBe("pending");
    expect(links()[0].kind).toBe("teacher_student");
  });

  it("rejects an unknown role hint", async () => {
    await expect(repo.requestLink(teacher, { email: student.email, relation: "wizard" })).rejects.toThrow(LinkError);
  });

  it("rejects your own email and malformed ones", async () => {
    await expect(repo.requestLink(teacher, { email: teacher.email, relation: "student" })).rejects.toThrow(/own email/);
    await expect(repo.requestLink(teacher, { email: "nope", relation: "student" })).rejects.toThrow(/valid email/);
  });

  it("a student can have a teacher and a parent, a parent several children", async () => {
    const tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
    await repo.requestLink(parent, { email: student.email, relation: "student" });
    await repo.requestLink(parent, { email: tom.email, relation: "student" });
    for (const row of links()) await repo.changeLink(row.target_id === student.id ? student : tom, row.id, "accept");
    expect(links().filter((row) => row.status === "accepted")).toHaveLength(2);
    await repo.requestLink(student, { email: teacher.email, relation: "teacher" });
    expect(links()).toHaveLength(3);
  });
});

describe("answering and ending", () => {
  it("decline, cancel, and remove follow the state machine", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    const id = links()[0].id;
    await expect(repo.changeLink(parent, id, "cancel")).rejects.toThrow(/not yours/);
    await expect(repo.changeLink(student, id, "cancel")).rejects.toThrow(/Only the person who asked/);
    expect(await repo.changeLink(teacher, id, "cancel")).toBe("revoked");
    await expect(repo.changeLink(student, id, "accept")).rejects.toThrow(/no longer open/);

    // the same pair can ask again after a cancel
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    expect(links()).toHaveLength(1);
    expect(links()[0].status).toBe("pending");
    expect(await repo.changeLink(student, id, "accept")).toBe("accepted");
    expect(await repo.changeLink(student, id, "remove")).toBe("revoked");
    expect(await repo.getAcceptedLink(teacher.id, student.id)).toBeNull();
  });

  it("holds a declined request for a day against the person who asked", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await repo.changeLink(student, links()[0].id, "decline");
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    expect(links()[0].status).toBe("declined");
    // the student can still reach out themselves
    const result = await repo.requestLink(student, { email: teacher.email, relation: "teacher" });
    expect(result.status).toBe("pending");
    expect(links()[0]).toMatchObject({ status: "pending", requester_id: student.id });
  });

  it("lists who is waiting, who asked, and who is connected, with names, roles and emails", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await repo.requestLink(teacher, { email: "later@home.com", relation: "student" });
    await repo.changeLink(student, links()[0].id, "accept");
    const mine = await repo.listConnections(teacher);
    expect(mine.accepted[0].other).toMatchObject({ displayName: "Maria", role: "student", email: "maria@home.com" });
    expect(mine.outgoing[0].other).toMatchObject({ email: "later@home.com", role: "student", awaitingSignup: true });
    expect(mine.incoming).toEqual([]);
  });
});

describe("before the migration is applied", () => {
  it("every accounts query fails in a way the routes recognise as 'setup needed'", async () => {
    db.drop("accounts", "account_links", "shared_items");
    for (const call of [
      () => repo.findAccountByEmail("a@b.co"),
      () => repo.listConnections({ id: "x", role: "teacher" }),
      () => repo.listSharedItems("x")
    ]) {
      const error = await call().then(() => null, (thrown) => thrown);
      expect(isSetupNeededError(error)).toBe(true);
    }
  });
});
