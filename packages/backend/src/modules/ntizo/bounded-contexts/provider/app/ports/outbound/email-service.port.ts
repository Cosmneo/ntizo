// Re-export the shared EmailServicePort so the BC depends on its own port name
// while still using the workspace-wide email contract.
export type {
  EmailMessage,
  EmailServicePort,
} from "../../../../../../../shared/infrastructure/email";
