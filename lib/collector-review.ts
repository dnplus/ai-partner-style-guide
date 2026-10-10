import { z } from "zod";
import { submissionSchema } from "./contract.ts";
import { deriveAssessment, validateSubmission } from "./assessment.ts";

export function prepareCollectorReview(input:unknown,now=Date.now()){
  const envelope=z.object({consent:z.object({localAnalysisApproved:z.literal(true),aggregateUploadApproved:z.literal(false)}).strict()}).passthrough().parse(input);
  const authorizedShape=submissionSchema.parse({...envelope,consent:{localAnalysisApproved:true,aggregateUploadApproved:true}});
  const assessment=deriveAssessment(authorizedShape);
  const validated=validateSubmission({...authorizedShape,assessment},now);
  return {...validated,consent:{localAnalysisApproved:true,aggregateUploadApproved:false},assessment};
}
