import {describe,it,expect} from 'vitest';import{defaultConfig}from'./api';import{durationIssue,segmentCount,promptFor,mediaMatches}from'./logic';import type{Settings}from'./types';
const c=defaultConfig.capabilities;const s:Settings={imageId:'i',videoId:'v',referenceIds:[],orientation:'video',tier:'1080p',ratio:'9:16',environment:'sunlit room',crop:{x:.5,y:.5},cleanBackground:true,copyCamera:false,keepSound:false,watermark:false,splitApproved:false,consent:true};
describe('provider-driven decisions',()=>{
it('blocks 12 seconds in image mode and permits switching',()=>{const m={width:360,height:640,duration:12};expect(durationIssue(m,{...s,orientation:'image'},c)).toContain('10s');expect(durationIssue(m,s,c)).toBe('');expect(durationIssue(m,{...s,orientation:'image',splitApproved:true},c)).toBe('')});
it('plans two paid segments for 45 seconds',()=>expect(segmentCount(45,30)).toBe(2));
it('does not silently split an eligible 30 second clip',()=>expect(segmentCount(30,30)).toBe(1));
it('face element references are only added in video mode',()=>{expect(promptFor(s,c).prompt).toContain('@Element1');expect(promptFor({...s,orientation:'image'},c).prompt).not.toContain('@Element1')});
it('strips appearance changes but retains environment',()=>{const p=promptFor({...s,environment:'sunlit living room. make her younger. different hair'},c);expect(p.prompt).toContain('sunlit living room');expect(p.prompt).not.toContain('younger');expect(p.removed).toHaveLength(2)});
it('adds positive static-camera fallback without a negative field',()=>{const p=promptFor(s,c);expect(p.prompt).toContain('Static camera');expect(c.supportsNegativePrompt).toBe(false)});
it('detects output drift beyond one frame',()=>{const a={duration:8,fps:24,frameCount:192,width:360,height:640};expect(mediaMatches(a,a)).toBe(true);expect(mediaMatches(a,{...a,duration:8.2,frameCount:197})).toBe(false)});
});
