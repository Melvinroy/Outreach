"use client";
import type { ReactNode } from "react";
import { Users, MessagesSquare, Target, Activity, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { projectOverview, relativeActivityTime } from '@/lib/overview.mjs';
import type { Snapshot, View, OverviewActivity } from './control-center';
import { projectRelationships } from '@/lib/relationship-projection.mjs';
import { Lifecycle } from './overview-cycle';

export function OverviewDashboard({snapshot, activities, demo, onSelect, onPerson, toolbar, relationships}: {relationships:ReturnType<typeof projectRelationships>;toolbar?:ReactNode; snapshot:Snapshot; activities:OverviewActivity[]; demo:boolean; onSelect:(view:View,filter:string)=>void; onPerson:(id:string)=>void}) {
  const data = {...projectOverview(snapshot, activities),...relationships};
  const percentage = data.percent === null ? '—' : `${data.percent}%`;
  const cards = [
    {label:'From discovery',value:relationships.groups.discovery.length,detail:'People found through research',icon:Users,color:'blue',filter:'discovery'},
    {label:'Other connections',value:relationships.groups.outside.length,detail:'Connections from elsewhere',icon:MessagesSquare,color:'blue',filter:'outside'},
    {label:'People & history',value:data.people,detail:'In your workflow',icon:Users,color:'green',filter:'all'},
    {label:'Conversion so far',value:percentage,detail:'Recorded connections → replies',icon:Target,color:'rose'},
  ];
  return <div className="ov-dashboard">
    <section className="ov-hero ov-welcome">
      <div><h1>Turn conversations into opportunities</h1><p className="ov-intro">Track your LinkedIn outreach — from first connection to real opportunities.</p></div>
      {toolbar}
    </section>
    <div className="ov-kpis">{cards.map(card => {
      const content = <><span className={`ov-kpi-icon ov-${card.color}`}><card.icon size={29}/></span><span className="ov-kpi-copy"><strong>{card.value}</strong><span>{card.label}</span><small>{card.detail}</small></span></>;
      return card.filter ? <button key={card.label} className="ov-kpi" onClick={()=>onSelect('people',card.filter!)}>{content}</button> : <div key={card.label} className="ov-kpi">{content}</div>;
    })}</div>
    <div className="ov-content"><Lifecycle relationships={relationships} snapshot={snapshot} onSelect={onSelect}/><aside className="ov-sidebar">
      <section className="ov-card ov-conversion"><h2>Relationship Progress</h2><p className="ov-subtitle">Recorded connections → replies</p><div className="ov-conversion-body">
        <div className="ov-ring" role="img" aria-label={data.available ? `${data.replied} of ${data.connected} recorded connected people have replied` : 'Reply rate unavailable: some recorded evidence could not be loaded'}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{width:180,height:180}}><PieChart><Pie data={data.available ? [{value:data.replied},{value:data.noReply || (data.connected ? 0 : 1)}] : [{value:0},{value:1}]} dataKey="value" cx="50%" cy="50%" innerRadius="77%" outerRadius="94%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}><Cell fill="#00836b"/><Cell fill="#e7edf4"/></Pie></PieChart></ResponsiveContainer>
          <div><strong>{percentage}</strong><span>Conversion so far</span></div>
        </div><div className="ov-conversion-details"><p className="ov-progress-caption">{data.available ? `${data.replied} replied · ${data.noReply} no recorded reply` : 'Evidence unavailable'}<br/>{data.connected} recorded connections</p><ul className="ov-milestones">{data.milestones.map(m=><li key={m.id}><span>{m.label}</span><strong>{m.count ?? '—'}</strong></li>)}</ul></div>
      </div><details className="ov-metric-help"><summary>How this is calculated</summary>{data.unknownSource > 0 && <p role="note">Source not recorded for {data.unknownSource} people. They are included in People &amp; history.</p>}<p>{data.replied} replied; {data.noReply} have no recorded reply, out of {data.connected} recorded connections. Each connected person is counted once, including outside connections. Replies use recorded inbound messages or reply evidence. Missing history can affect this figure. Milestones count each person once and overlap. Meetings and referrals use recorded relationship events, never hiring links. Unavailable evidence is shown as an em dash.</p></details></section>
      <section className="ov-card ov-activity"><div className="ov-activity-title"><h2><Activity size={19}/> Recent Activity</h2><button onClick={()=>onSelect('people','all')}>View people <ArrowRight size={14}/></button></div>
      {data.recent.length ? <ul>{data.recent.map(e=><li key={`${e.kind}-${e.id}`}><button onClick={()=>onPerson(e.contactId)}><strong>{e.name}</strong><span>{e.label}</span></button><time dateTime={e.date} title={new Date(e.date).toLocaleString()}>{relativeActivityTime(e.date)}</time></li>)}</ul> : <p className="ov-empty">No recent activity recorded.</p>}</section>
    </aside></div><p className="ov-fresh">{demo ? 'Sample workspace · ' : ''}Updated {new Date(snapshot.as_of).toLocaleString()}</p>
  </div>;
}


