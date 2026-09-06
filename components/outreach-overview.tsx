"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, Grip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import "./outreach-overview.css";
type Stage = "discovery" | "invitations" | "pending" | "accepted" | "outside" | "replies" | "drafts" | "review" | "ongoing";
type OverviewSummary = { toReach: number; stages: Record<Stage, string[] | null>; waiting: number; queued: number; replyContext: number };
export type OverviewPerson = { id: string; name: string; company: string; role: string | null; status: string; profileUrl?: string };
type Destination = "unreached" | "all" | "replies" | "followups" | "pending" | "relationships";
type Point = { x: number; y: number; vx: number; vy: number };
type Drag = { index: number; pointer: number; x: number; y: number; originX: number; originY: number };

/** An on-demand spring: no idle animation loop, and no motion library needed. */
function useSpringGraph(reduced: boolean) {
  const board = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const controls = useRef<{ start: (index: number, event: ReactPointerEvent<HTMLElement>) => void; move: (event: ReactPointerEvent<HTMLElement>) => void; end: () => void; nudge: (index: number, key: string) => void; reset: () => void }>({ start: () => {}, move: () => {}, end: () => {}, nudge: () => {}, reset: () => {} });

  useEffect(() => {
    const elements = nodes.current;
    const surface = board.current;
    const layer = canvas.current;
    if (!surface || !layer) return;
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    const points: Point[] = Array.from({ length: 9 }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
    let drag: Drag | null = null;
    let frame = 0;
    let last = 0;
    let disposed = false;

    function draw() {
      if (!ctx || !surface) return;
      const bounds = surface.getBoundingClientRect();
      ctx.clearRect(0, 0, bounds.width, bounds.height);

      const boxes = nodes.current.map((node) => node?.getBoundingClientRect());
      const connect = (from: number, to: number, dashed = false) => {
        const a = boxes[from], b = boxes[to];
        if (!a || !b) return;
        const sx = a.left + a.width / 2 - bounds.left;
        const sy = a.bottom - bounds.top;
        const ex = b.left + b.width / 2 - bounds.left;
        const ey = b.top - bounds.top - 4;
        const middle = sy + (ey - sy) / 2;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx, middle, ex, middle, ex, ey);        ctx.lineWidth = 1.1; ctx.strokeStyle = dashed ? "#b8c5be" : "#a4b8af";
        ctx.setLineDash(dashed ? [4, 4] : []); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 2.5, ey - 4); ctx.lineTo(ex + 2.5, ey - 4);
        ctx.closePath(); ctx.fillStyle = "#7e9fab"; ctx.fill();
      };
      connect(0, 1); connect(1, 2); connect(1, 3); connect(4, 3, true);
      connect(3, 5); connect(3, 6); connect(5, 7); connect(6, 7); connect(7, 8);
    }
    function paint() {
      points.forEach((point, index) => {
        const element = nodes.current[index];
        element?.style.setProperty("--move-x", `${point.x}px`);
        element?.style.setProperty("--move-y", `${point.y}px`);
        element?.style.setProperty("--tilt", reduced ? "0deg" : `${Math.max(-2, Math.min(2, point.x / 65))}deg`);
      });
      draw();
    }
    function tick(time: number) {
      frame = 0;
      if (disposed) return;
      const dt = Math.min((time - (last || time - 16)) / 1000, 0.032);
      last = time;
      let moving = false;
      points.forEach((p, i) => {
        if (drag?.index === i) return;
        if (reduced) { p.x = p.y = p.vx = p.vy = 0; return; }
        p.vx += (-220 * p.x - 22 * p.vx) * dt;
        p.vy += (-220 * p.y - 22 * p.vy) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.vx) + Math.abs(p.vy) < 0.15) p.x = p.y = p.vx = p.vy = 0;
        else moving = true;
      });
      paint();
      if (moving) frame = requestAnimationFrame(tick);
    }
    function wake() { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } }
    function release() { if (drag) nodes.current[drag.index]?.removeAttribute("data-dragging"); drag = null; wake(); }
    function reset() { release(); points.forEach((p) => { p.x = p.y = p.vx = p.vy = 0; }); paint(); }
    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (layer!.width !== Math.round(surface!.clientWidth * ratio)) layer!.width = Math.round(surface!.clientWidth * ratio);
      if (layer!.height !== Math.round(surface!.clientHeight * ratio)) layer!.height = Math.round(surface!.clientHeight * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      reset();
    }
    controls.current = {
      start(index, event) {
        if (event.button !== 0 || !event.isPrimary) return;
        const target = event.target as HTMLElement;
        if (target.closest("button,a,input") && !target.closest("[data-drag-handle]")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag = { index, pointer: event.pointerId, x: event.clientX, y: event.clientY, originX: points[index].x, originY: points[index].y };
        points[index].vx = points[index].vy = 0;
        nodes.current[index]?.setAttribute("data-dragging", "true");
      },
      move(event) {
        if (!drag || drag.pointer !== event.pointerId) return;
        const limit = surface.clientWidth < 720 ? 24 : 90;
        points[drag.index].x = Math.max(-limit, Math.min(limit, drag.originX + event.clientX - drag.x));
        points[drag.index].y = Math.max(-65, Math.min(65, drag.originY + event.clientY - drag.y));
        paint();
      },
      end: release,
      nudge(index, key) {
        const p = points[index];
        if (key === "Escape" || key === "Home") { reset(); return; }
        p.x = key === "ArrowLeft" ? -28 : key === "ArrowRight" ? 28 : 0;
        p.y = key === "ArrowUp" ? -22 : key === "ArrowDown" ? 22 : 0;
        paint(); wake();
      },
      reset,
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    
    window.addEventListener("blur", release);
    resize();
    return () => { disposed = true; observer.disconnect(); window.removeEventListener("blur", release); cancelAnimationFrame(frame); elements.forEach((node) => node?.removeAttribute("data-dragging")); };
  }, [reduced]);
  return { board, canvas, nodes, controls };
}


export function OutreachOverview({ summary, people, onNavigate, demo = false }: { summary: OverviewSummary; people: OverviewPerson[]; onNavigate: (destination: Destination) => void; demo?: boolean }) {
  const [systemReduced, setSystemReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [motionPaused, setMotionPaused] = useState(false);
  const [dialog, setDialog] = useState<Stage | null>(null);
  const [query, setQuery] = useState("");
  const reduced = systemReduced || motionPaused;
  const { board, canvas, nodes, controls } = useSpringGraph(reduced);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const navigate = (destination: Destination) => {
    setDialog(null); onNavigate(destination);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus());
  };
  const cards: { id: Stage; label: string; note: string; detail: string; shape: string; destination?: Destination }[] = [
    { id: "discovery", label: "Discovered", note: `${summary.toReach} still to reach`, shape: "circle", destination: "all", detail: "People backed by a discovery recommendation. Still to reach includes only eligible, undiscarded people with no recorded contact or blocking guardrail." },
    { id: "invitations", label: "Invitations sent", note: "Recorded invitations", shape: "circle", detail: "Distinct people with a recorded invitation sent. This is a historical milestone, not a count of accepted connections." },
    { id: "pending", label: "Awaiting acceptance", note: "Still pending", shape: "pill", destination: "pending", detail: "People whose current recorded status is request sent. No acceptance is inferred." },
    { id: "accepted", label: "Connected", note: "Accepted / known connections", shape: "circle", detail: "People with an acceptance event or a current connected-or-later status. Includes any known outside connections; it is not calculated by subtracting pending invitations." },
    { id: "outside", label: "Outside connections", note: demo ? "3 manual connections" : "Not tracked separately", shape: "pill", detail: demo ? "Three synthetic people connected outside the discovery pipeline. They join the same next-step flow without an Outreach invitation." : "Outside/manual origins are not reliably identified separately. The total is unknown, not zero. Known connected people can still appear in Connected." },
    { id: "replies", label: "Replies needed", note: `${summary.replyContext} need context or a draft`, shape: "action", destination: "replies", detail: "People with an inbound-reply task needing context or review. Some already have a draft in Ready for review. Approved and queued replies are excluded." },
    { id: "drafts", label: "First drafts needed", note: "No incoming reply", shape: "action", destination: "followups", detail: "Due proactive follow-up tasks marked needs review with no nonblank draft. These are task records, not invitations minus replies. Connections still in their waiting window are excluded." },
    { id: "review", label: "Ready for review", note: "A draft is waiting for you", shape: "action", detail: "People with a nonblank draft and needs-review status, for an inbound reply or a due proactive follow-up. Context-required, approved and queued items are excluded." },
    { id: "ongoing", label: "Conversations", note: "Sent / ongoing", shape: "circle", destination: "relationships", detail: "People currently marked messaged, replied, meeting scheduled or referred. A conversation may also have a new reply awaiting action. Approval alone never counts as sent." },
  ];
  const selected = cards.find(card => card.id === dialog);
  const ids = dialog ? summary.stages[dialog] : [];
  const shownPeople = people.filter(p => ids?.includes(p.id) && `${p.name} ${p.company}`.toLowerCase().includes(query.trim().toLowerCase()));
  function keyboard(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape", "Home"].includes(event.key)) { event.preventDefault(); controls.current.nudge(index, event.key); }
  }
  return <section className="outreach-overview" aria-labelledby="overview-heading">
    <header className="overview-intro"><div><h1 id="overview-heading">Your outreach</h1><p>From discovery to conversation.</p></div><span className="overview-sample">{demo ? "Sample data" : "Recorded activity"}</span></header>
    <div ref={board} className="overview-graph" data-reduced-motion={reduced}>
      <canvas ref={canvas} aria-hidden="true" className="overview-connections" />      {cards.map((card, index) => <article key={card.id} ref={node => { nodes.current[index] = node; }} className={`overview-node shape-${card.shape} node-${card.id}`} data-overview-node={card.id}
        onPointerDown={e => controls.current.start(index, e)} onPointerMove={e => controls.current.move(e)} onPointerUp={() => controls.current.end()} onPointerCancel={() => controls.current.end()} onLostPointerCapture={() => controls.current.end()}>
        <button type="button" className="overview-grip" data-drag-handle aria-label={`Move ${card.label} card`} aria-describedby="overview-drag-help" onKeyDown={e => keyboard(index, e)}><Grip size={14} /></button>

        <button className="overview-node-open" onClick={() => { setQuery(""); setDialog(card.id); }} aria-label={`View ${card.label}`}><strong className="overview-count">{summary.stages[card.id]?.length.toLocaleString() ?? "—"}</strong><h2>{card.label}</h2></button>
      </article>)}
    </div>
    <footer className="overview-footer"><span>Select a stage to explore</span><button type="button" aria-pressed={reduced} onClick={() => setMotionPaused(v => !v)} disabled={systemReduced}>{reduced ? "Motion reduced" : "Reduce motion"}</button></footer>
    <p className="sr-only" id="overview-drag-help">Use the grip to drag a stage. Arrow keys move a focused grip; Escape resets. Release to settle. People can appear at several stages; arrows show next steps rather than a subtraction.</p>    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent className="overview-dialog"><DialogHeader><DialogTitle>{selected?.label} <span className="dialog-count">{ids?.length ?? "Unknown"}</span></DialogTitle><DialogDescription>{selected?.detail} People can appear at several stages.</DialogDescription></DialogHeader>
      <p className="overview-detail-context">{selected?.note}{dialog === "accepted" ? ` · ${summary.waiting} in the waiting window` : ""}{dialog === "review" ? ` · ${summary.queued} already approved or queued` : ""}</p>
      {ids !== null && <><Input aria-label="Search stage people" placeholder="Find a person or company…" value={query} onChange={e => setQuery(e.target.value)} /><div className="overview-people">{shownPeople.map(person => <div className="overview-person" key={person.id}><span className="overview-person-icon"><Check size={15} /></span><div><strong>{person.name}</strong><span>{person.role} · {person.company}</span><small>{person.status.replaceAll("_", " ")}</small></div>{person.profileUrl && <a href={person.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${person.name} on LinkedIn`}><ArrowUpRight size={18} /></a>}</div>)}{!shownPeople.length && <p className="overview-empty">{query ? "No people match that search." : "No people recorded at this stage."}</p>}</div></>}
      {selected?.destination && <button className="overview-queue-link" onClick={() => navigate(selected.destination!)}>Open {selected.destination === "all" ? "outreach" : selected.destination} queue <ArrowRight size={15} /></button>}
      {dialog === "review" && <div className="overview-dialog-links"><button onClick={() => navigate("replies")}>Review replies <ArrowRight size={14} /></button><button onClick={() => navigate("followups")}>Review follow-ups <ArrowRight size={14} /></button></div>}
      {demo && <p className="overview-dialog-note">Illustrative people and task states. This flow includes three outside connections to show how they enter; no real account activity or sending is connected.</p>}
    </DialogContent></Dialog>
  </section>;
}
