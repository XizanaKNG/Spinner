import {segments,choose,targetRotation,winnerAt,boundaryPosition,TAU,mod} from './engine.js';
export const CRUISE_SPEED=TAU*2; // Two turns per second, independent of the selected duration.
/** Plan exact landing geometry while preserving a constant cruise speed. */
export function planSpin(wheel,{initialRotation=0,rng}={}){
 const seconds=wheel.spinSettings.duration;
 if(!Number.isFinite(seconds)||seconds<=0)throw Error('Choose a positive spin duration.');
 const parts=segments(wheel.entries);if(!parts.length)return null;
 const selected=choose(parts,rng),landing=mod(targetRotation(selected,initialRotation,rng));
 const acceleration=Math.min(1,seconds*.15),deceleration=Math.min(7,seconds*.36),cruise=seconds-acceleration-deceleration;
 // Subsecond spins need a higher peak to reach every possible landing angle. All presets (2s+) share the same speed.
 const speed=Math.max(CRUISE_SPEED,TAU*1.05/deceleration),accelerationDistance=speed*acceleration*.5;
 const decelerationStart=initialRotation+accelerationDistance+speed*cruise,capacity=speed*deceleration;
 const delta=mod(landing-mod(decelerationStart));
 let turns=Math.max(0,Math.round((capacity*.5-delta)/TAU)),stopDistance=delta+turns*TAU;
 if(stopDistance<=1e-10){turns++;stopDistance=delta+turns*TAU;}
 if(stopDistance>=capacity){turns--;stopDistance=delta+turns*TAU;}
 // v(u)=speed*(1-u)^exponent: starts at cruise speed, declines monotonically, and reaches zero exactly at the end.
 const exponent=capacity/stopDistance-1,target=decelerationStart+stopDistance;
 return {parts,selected,seconds,acceleration,deceleration,cruise,speed,accelerationDistance,decelerationStart,stopDistance,exponent,target,initialRotation};
}
export function frameAt(plan,elapsed){const time=Math.max(0,Math.min(plan.seconds,elapsed)),{acceleration:A,deceleration:D,speed}=plan;let rotation,velocity,phase;
 if(time>=plan.seconds){rotation=plan.target;velocity=0;phase='finished';}
 else if(time<A){const u=time/A;rotation=plan.initialRotation+speed*A*(u**3-.5*u**4);velocity=speed*(3*u*u-2*u*u*u);phase='accelerating';}
 else if(time<plan.seconds-D){rotation=plan.initialRotation+plan.accelerationDistance+speed*(time-A);velocity=speed;phase='spinning';}
 else {const u=(time-(plan.seconds-D))/D;rotation=plan.decelerationStart+plan.stopDistance*(1-(1-u)**(plan.exponent+1));velocity=speed*(1-u)**plan.exponent;phase='decelerating';}
 return {rotation,velocity,phase,progress:time/plan.seconds};
}
/** Rendering and audio observe the plan. Neither can pick a different winner. */
export function animateSpin(wheel,{initialRotation=0,onFrame=()=>{},onBoundary=()=>{},rng,raf=requestAnimationFrame,now=()=>performance.now()}={}){
 const plan=planSpin(wheel,{initialRotation,rng});if(!plan)return Promise.resolve(null);const start=now();let previous=boundaryPosition(plan.parts,initialRotation);
 return new Promise((resolve,reject)=>{function frame(time){try{const state=frameAt(plan,(time-start)/1000);onFrame(state);const position=boundaryPosition(plan.parts,state.rotation);if(position!==previous)onBoundary({count:Math.abs(position-previous),time});previous=position;if(state.phase!=='finished')raf(frame);else resolve({wheel,entry:winnerAt(plan.parts,plan.target).entry,rotation:plan.target,selectedId:plan.selected.entry.id});}catch(e){reject(e);}}raf(frame);});
}
