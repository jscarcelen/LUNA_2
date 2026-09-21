import type { Activity } from "./activity";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * Standalone interactive HTML: the same questions with inputs and a local "Check" — for sharing
 * outside the platform (no tracking). The platform player is the tracked default.
 */
export function renderActivityHtml(activity: Activity): string {
  const q = activity.questions.map((question, index) => {
    const head = `<div class="q-head"><span class="n">${index + 1}</span><div>${question.group ? `<div class="g">${esc(question.group)}</div>` : ""}<div class="p">${esc(question.kind === "match" ? "Match each pair" : question.prompt)}</div></div></div>`;
    let body = "";
    if (question.kind === "choice") body = `<div class="opts">${(question.options || []).map((o) => `<label class="opt"><input type="radio" name="${esc(question.id)}" value="${esc(o)}"> ${esc(o)}</label>`).join("")}</div>`;
    else if (question.kind === "boolean") body = `<div class="opts">${["true", "false"].map((v) => `<label class="opt"><input type="radio" name="${esc(question.id)}" value="${v}"> ${v === "true" ? "True" : "False"}</label>`).join("")}</div>`;
    else if (question.kind === "match") {
      const rights = [...(question.pairs || []).map((p) => p.right)].sort();
      body = `<div class="pairs">${(question.pairs || []).map((p) => `<div class="pair"><span>${esc(p.left)}</span><span>→</span><select data-q="${esc(question.id)}" data-left="${esc(p.left)}"><option value="">Choose…</option>${rights.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select></div>`).join("")}</div>`;
    } else if (question.kind === "flashcard") body = `<div class="card" onclick="this.classList.toggle('on')"><span class="front">Tap to reveal</span><span class="back">${esc(question.back || "")}</span></div><div class="opts"><label class="opt"><input type="radio" name="${esc(question.id)}" value="known"> ✓ I knew it</label><label class="opt"><input type="radio" name="${esc(question.id)}" value="unknown"> ✗ Not yet</label></div>`;
    else body = `<input class="txt" name="${esc(question.id)}" placeholder="${question.kind === "number" ? "Your result" : "Your answer"}">`;
    return `<section class="q" id="q-${esc(question.id)}">${head}${body}<div class="fb"></div></section>`;
  }).join("");
  const data = JSON.stringify(activity).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(activity.title)}</title>
<style>
body{margin:0;background:#f5f5f7;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1d1d1f}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px}
.hdr,.q{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:18px;padding:20px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05)}
h1{margin:0;font-size:26px}.sub{color:#6e6e73;margin:6px 0 0}
.q-head{display:flex;gap:12px;align-items:flex-start}.n{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:#0071e3;color:#fff;font-weight:700;flex:none}
.g{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6e6e73;font-weight:600}.p{font-weight:600;font-size:16px}
.opts{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:12px}.opt{border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:10px 12px;cursor:pointer;font-size:14px}
.txt{margin-top:12px;width:100%;max-width:360px;border:1px solid rgba(0,0,0,.15);border-radius:12px;padding:10px 12px;font-size:14px}
.pairs{display:grid;gap:8px;margin-top:12px}.pair{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:8px 12px}select{border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:8px}
.card{margin-top:12px;border:1px solid rgba(0,0,0,.1);border-radius:16px;padding:22px;text-align:center;font-weight:600;font-size:18px;background:#f5f5f7;cursor:pointer}.card .back{display:none}.card.on .front{display:none}.card.on .back{display:inline}
.fb{margin-top:8px;font-size:14px}.q.ok{border-color:rgba(52,199,89,.6);background:rgba(52,199,89,.05)}.q.bad{border-color:rgba(255,59,48,.5);background:rgba(255,59,48,.04)}.q.bad .fb{color:#d70015}
.btn{display:inline-block;border:0;border-radius:999px;background:#0071e3;color:#fff;font-weight:600;padding:12px 22px;font-size:15px;cursor:pointer}
.score{font-size:30px;font-weight:700;margin-top:12px}
</style></head><body><div class="wrap">
<div class="hdr"><h1>${esc(activity.title)}</h1>${activity.subtitle ? `<p class="sub">${esc(activity.subtitle)}</p>` : ""}<div id="score"></div></div>
${q}
<div style="text-align:right"><button class="btn" id="check">Check my answers</button></div>
</div>
<script>
const ACT=${data};const norm=v=>String(v==null?"":v).trim().toLowerCase().replace(/\\s+/g," ").replace(/[.,;:!?"'()]/g,"");
document.getElementById("check").onclick=()=>{let score=0,total=0;for(const q of ACT.questions){const el=document.getElementById("q-"+q.id);let given,ok=null;
if(q.kind==="match"){given={};el.querySelectorAll("select").forEach(s=>{given[s.dataset.left]=s.value});ok=Object.entries(q.answer).every(([l,r])=>norm(given[l])===norm(r));}
else if(q.kind==="flashcard"){const r=el.querySelector("input:checked");ok=r?r.value==="known":null;}
else if(q.kind==="number"){const r=el.querySelector("input.txt");const a=Number(String(q.answer).replace(",","."));const b=Number(String(r.value).replace(",","."));ok=isFinite(a)&&isFinite(b)?Math.abs(a-b)<1e-9:norm(r.value)===norm(q.answer);}
else{const r=el.querySelector("input:checked")||el.querySelector("input.txt");given=r?r.value:"";ok=norm(given)===norm(q.answer);}
if(ok!==null){total++;if(ok)score++;}el.classList.toggle("ok",ok===true);el.classList.toggle("bad",ok===false);
el.querySelector(".fb").textContent=ok===false?("Correct answer: "+(q.kind==="match"?Object.entries(q.answer).map(([l,r])=>l+" → "+r).join(" · "):q.answer)+(q.explanation?" — "+q.explanation:"")):"";
el.querySelectorAll("input,select").forEach(i=>i.disabled=true);}
document.getElementById("score").innerHTML='<div class="score">'+score+' / '+total+'</div>';document.getElementById("check").style.display="none";window.scrollTo({top:0,behavior:"smooth"});};
</script></body></html>`;
}
