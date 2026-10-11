import { z } from "zod";
import { deriveAssessment, validateSubmission } from "./assessment.ts";

export function prepareCollectorReview(input:unknown,now=Date.now()){
  const envelope=z.object({consent:z.object({localAnalysisApproved:z.literal(true),aggregateUploadApproved:z.literal(false)}).strict()}).passthrough().parse(input);
  const validated=validateSubmission({...envelope,consent:{localAnalysisApproved:true,aggregateUploadApproved:true}},now);
  return {...validated,consent:{localAnalysisApproved:true,aggregateUploadApproved:false},assessment:deriveAssessment(validated)};
}
