"use client";

import { useMemo, useState } from "react";
import { libraryGroups, uploadSubjects } from "./model.js";
import { AddMaterialSheet } from "./AddMaterialSheet.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { Empty, MobileScreen, Row, RowList, Segmented, SectionTitle, Skeleton, TypeIcon, primaryClass } from "./ui.js";

const PER_SUBJECT = 6;

/**
 * Library on the phone: everything to study, by subject, searchable, with what the student (or a teacher) added kept
 * apart from what Luna made. Tapping opens it (the activity player, the reader or the document reader). "Add material"
 * opens the upload sheet. Organising folders in bulk stays on the website (Courses).
 */
export function MobileLibrary({ workspace = null, loading = false, selectedSubjectId = "", startAdding = false, onOpen, onOpenPage, onUpload, onCreateSubject, onCreateFolder }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [adding, setAdding] = useState(startAdding);
  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => libraryGroups(workspace, query, t)
    .map((group) => ({ ...group, items: group.items.filter((item) => kind === "all" || item.kind === kind) }))
    .filter((group) => group.items.length), [workspace, query, kind, t]);
  const everything = useMemo(() => libraryGroups(workspace, "", t), [workspace, t]);
  const documentById = (id) => (workspace?.subjects || []).flatMap((subject) => subject.documents || []).find((document) => document.id === id) || null;
  const isEmpty = !everything.length;

  return (
    <MobileScreen
      title={t("mobile.tab.library")}
      label={t("mobile.tab.library")}
      action={<button type="button" className={`${primaryClass} min-h-[40px] px-4 text-[15px]`} onClick={() => setAdding(true)} disabled={!workspace}>{t("mobile.add")}</button>}
    >
      {!workspace && loading ? <Skeleton rows={3} /> : null}
      {workspace && isEmpty ? (
        <Empty
          title={t("mobile.library.empty")}
          text={t("mobile.library.emptyText")}
          actions={[{ label: t("mobile.upload"), onClick: () => setAdding(true) }, { label: t("mobile.library.create"), onClick: () => onOpenPage?.("create") }]}
        />
      ) : null}
      {workspace && !isEmpty ? (
        <>
          <div className="grid gap-3">
            <label className="relative block">
              <span className="sr-only">{t("mobile.library.searchAria")}</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
              <input type="search" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("mobile.library.search")} className="min-h-[44px] w-full rounded-full border-0 bg-[rgba(118,118,128,0.12)] pl-10 pr-4 text-[16px] text-ink outline-none focus:ring-2 focus:ring-[var(--accent-soft)]" />
            </label>
            <Segmented label={t("mobile.library.show")} options={[["all", t("mobile.all")], ["source", t("mobile.library.added")], ["made", t("mobile.library.byLuna")]]} value={kind} onChange={setKind} />
          </div>
          {groups.length ? groups.map((group) => {
            const open = Boolean(expanded[group.subjectId]) || Boolean(query);
            const shown = open ? group.items : group.items.slice(0, PER_SUBJECT);
            return (
              <div key={group.subjectId} className="grid gap-2">
                <SectionTitle actionLabel={group.items.length > PER_SUBJECT && !query ? (open ? t("mobile.library.less") : t("mobile.library.seeAll", { count: group.items.length })) : ""} onAction={() => setExpanded((previous) => ({ ...previous, [group.subjectId]: !open }))}>
                  {group.subjectName}{group.shared ? <span className="ml-1.5 text-[13px] font-normal text-soft-ink">{t("mobile.library.shared")}</span> : null}
                </SectionTitle>
                <RowList>
                  {shown.map((item) => (
                    <Row
                      key={item.id}
                      icon={<TypeIcon typeId={item.typeId} made={item.kind === "made"} />}
                      title={item.name}
                      detail={[item.type, item.folderName].filter(Boolean).join(" · ")}
                      ariaLabel={`${item.name}, ${item.type}`}
                      onClick={() => onOpen?.(documentById(item.id), item.subjectId)}
                    />
                  ))}
                </RowList>
              </div>
            );
          }) : <Empty title={t("mobile.library.none")} text={query ? t("mobile.library.noMatch", { query }) : t("mobile.library.noKind")} actions={query ? [{ label: t("mobile.library.clear"), onClick: () => setQuery("") }] : []} />}
          <p className="m-0 text-center text-[13px] text-soft-ink">{t("mobile.library.computer")}</p>
        </>
      ) : null}
      {adding && workspace ? (
        <AddMaterialSheet
          subjects={uploadSubjects(workspace)}
          defaultSubjectId={selectedSubjectId}
          onClose={() => setAdding(false)}
          onUpload={onUpload}
          onCreateSubject={onCreateSubject}
          onCreateFolder={onCreateFolder}
          onOpenPage={(target) => { setAdding(false); onOpenPage?.(target); }}
          onOpenDocument={(documentId, subjectId) => { const document = documentById(documentId); setAdding(false); if (document) onOpen?.(document, subjectId); }}
        />
      ) : null}
    </MobileScreen>
  );
}
