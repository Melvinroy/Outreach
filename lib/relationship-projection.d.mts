import type {Snapshot,Discovery,OverviewActivity} from '../components/control-center';
import type {ManualState} from '../components/manual-queue';
export type DeliveryEvidence={id:string;contact_id:string;status:string;confirmation_signal?:string|null;failure_reason?:string|null};
export type AttentionReason={code:string;label:string;next:string;priority:number};
export type RelationshipProjection={groups:Record<string,string[]>;reasons:Record<string,AttentionReason[]>;batches:ManualState['batches'];available:boolean;connected:number;replied:number;noReply:number;percent:number|null;milestones:{id:string;label:string;count:number|null}[]};
export function projectRelationships(snapshot:Snapshot,options?:{manual?:ManualState|null;evidence?:DeliveryEvidence[];recommendations?:Discovery[];activities?:OverviewActivity[];now?:number;evidenceAvailable?:boolean}):RelationshipProjection;
export function deliveryOutcome(item:Partial<DeliveryEvidence>):string|null;
export function batchOutcomes(batch:{items:{contact_id:string;name?:string;status:string;confirmation_signal?:string|null;failure_reason?:string|null}[]}):{counts:Record<string,number>;affected:{id:string;name:string;outcome:string}[];label:string};
