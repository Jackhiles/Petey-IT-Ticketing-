export { checkHealth } from "./health";
export type { CheckStatus, HealthDeps, HealthReport } from "./health";

export { ACTIONS, can } from "./permissions";
export type { Action, Actor, Resource, Role } from "./permissions";

export { ConflictError, CoreError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
export type { FieldErrors } from "./errors";

export { MIN_PASSWORD_LENGTH, authHandler, getSessionUser } from "./auth";
export type { SessionUser } from "./auth";

export { createFirstAdmin, needsSetup } from "./setup";

export {
  ROLES,
  createUser,
  getUser,
  listDepartments,
  listUsers,
  resetUserTwoFactor,
  setUserPassword,
  updateUser,
} from "./users";
export type { UserSummary } from "./users";

export {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
} from "./groups";
export type { GroupDetail, GroupSummary } from "./groups";

export { getSecuritySettings, mustEnrollTwoFactor, updateSecuritySettings } from "./settings";
export type { SecuritySettings } from "./settings";

export { attachmentMaxBytes } from "./config";
export { sanitizeHtml } from "./html";
export { getAttachment, MAX_FILES_PER_MESSAGE } from "./attachments";
export type { AttachmentDownload, UploadInput } from "./attachments";

export {
  STATUS_TYPES,
  createCategory,
  createPriority,
  createStatus,
  deleteCategory,
  deletePriority,
  deleteStatus,
  listCategories,
  listPriorities,
  listStatuses,
  ticketUsage,
  updateCategory,
  updatePriority,
  updateStatus,
} from "./ticket-config";
export type { CategoryOption, PriorityOption, StatusOption, StatusType } from "./ticket-config";

export { formatTicketNumber, getTicketSettings, updateTicketSettings } from "./ticket-settings";
export type { TicketSettings } from "./ticket-settings";

export {
  SORTS,
  TICKET_TYPES,
  BOARD_COLUMN_LIMIT,
  addMessage,
  bulkUpdateTickets,
  getTicketBoard,
  createTicket,
  getTicket,
  listAssignees,
  listGroupOptions,
  listRequesterOptions,
  listTickets,
  ticketListQuerySchema,
  updateTicket,
} from "./tickets";
export type {
  TicketAttachment,
  TicketBoardColumn,
  TicketLinkKind,
  TicketLinkView,
  TimeEntryView,
  TicketDetail,
  TicketHistoryEntry,
  TicketListItem,
  TicketListQuery,
  TicketMessageView,
  TicketType,
} from "./tickets";

export { createSavedView, deleteSavedView, listSavedViews } from "./views";
export type { SavedViewSummary } from "./views";

export { listTags, tagUsage, createTag, updateTag, deleteTag, setTicketTags } from "./tags";
export type { TagOption } from "./tags";
export { addWatcher, removeWatcher } from "./watchers";
export { logTime, deleteTimeEntry } from "./time-entries";
export { heartbeat, leaveTicket, PRESENCE_WINDOW_MS } from "./presence";
export type { PresenceView } from "./presence";
export { linkTickets, unlinkTickets, mergeTickets, splitMessage } from "./ticket-links";
export {
  listCannedResponses,
  renderCannedResponse,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
} from "./canned-responses";
export type { CannedResponseSummary } from "./canned-responses";
export { listMacros, createMacro, deleteMacro, runMacro, macroActionSchema } from "./macros";
export type { MacroAction, MacroSummary } from "./macros";
export { SHARING } from "./sharing";
export type { Sharing } from "./sharing";
export { TEMPLATE_VARIABLES } from "./templates";

export {
  CUSTOM_FIELD_TYPES,
  applicableFields,
  createCustomField,
  listCustomFields,
  updateCustomField,
} from "./custom-fields";
export type { CustomFieldDefView, CustomFieldType, CustomFieldValue } from "./custom-fields";
export { listMyTickets, markOwnTicketResolved, reopenOwnTicket } from "./portal";
export type { MyTicketItem } from "./portal";
