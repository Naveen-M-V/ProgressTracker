# Implementation Plan: Upsow Progress Tracker MVP

Build the complete **Upsow Progress Tracker MVP**, an internal team task-management and collaboration platform fulfilling all 14 PRD sections with an explicit, robust architecture: **Route → Service → SQLite Transaction → Event Dispatcher (Activity, Notifications, Socket.io)**, database-backed BLOB attachments, dedicated `backend/` and `frontend/` directories, and full authentication.

---

## User Architecture Clarifications

### Explicit Event Flow & Service Layering

Rather than coupling business logic or event triggers directly in routes or database triggers, the backend will strictly adhere to an explicit, predictable multi-stage pipeline:

```mermaid
flowchart TD
    ClientRequest[Client Action: Drag Kanban Card / Update Task / Post Chat] --> Route[1. Route / Controller Layer: Validation & Auth]
    Route --> Service[2. Service Layer: TaskService / ProjectService / ChatService]
    Service --> Tx[3. SQLite Atomic Transaction: db.transaction()]
    Tx --> Dispatcher[4. Central Event Dispatcher: eventDispatcher.dispatch()]
    Dispatcher --> ActivityHandler[Activity Logger: Writes Audit Trail to DB]
    Dispatcher --> NotificationHandler[Notification Engine: Evaluates Rules & Writes In-App Alerts]
    Dispatcher --> SocketHandler[Socket.io Broadcaster: Live Pushes to Client Rooms]
```

### Flow Breakdown
1. **Route Layer (`routes/`)**: Validates incoming payload, extracts authenticated `req.user`, and invokes the corresponding Service method.
2. **Service Layer (`services/`)**: Orchestrates business logic, permission checks, and determines state transitions.
3. **SQLite Transaction Layer**: Performs atomic SQL operations inside `db.transaction()` (e.g., updating task status, updating ordering, attaching subtasks) guaranteeing ACID consistency.
4. **Event Dispatcher (`events/dispatcher.ts`)**: Upon transaction commit, dispatches typed events (e.g., `TaskEvents.STATUS_CHANGED`, `TaskEvents.ASSIGNED`, `TaskEvents.COMMENT_ADDED`) to three explicit handlers:
   - **Activity Handler (`events/handlers/activity.ts`)**: Appends structured audit log records (`activity_logs` table) recording actor, action, old value, new value, and description.
   - **Notification Handler (`events/handlers/notification.ts`)**: Evaluates PRD notification rules (assignee changes, mentions, deadline alerts, status updates) and generates in-app notification records (`notifications` table).
   - **Socket Handler (`events/handlers/socket.ts`)**: Broadcasts targeted WebSocket messages to connected clients (project rooms and user channels) for zero-latency reactive updates on Kanban, Calendar, Dashboard, and My Work views.

---

## Architecture & Directory Structure

```
e:\UpsowWork\
├── package.json                         # Root helper scripts (install, dev, build)
│
├── backend\
│   ├── package.json
│   ├── tsconfig.json
│   ├── data\                           # SQLite database file (upsow.db)
│   └── src\
│       ├── index.ts                     # Express server, Socket.io initialization
│       ├── db.ts                        # SQLite schema, migrations, connection, seed data
│       ├── middleware\
│       │   ├── auth.ts                  # JWT verification & role authorization (Admin/PM/Member)
│       │   └── upload.ts                # Multer in-memory buffer storage for database BLOBs
│       ├── routes\
│       │   ├── auth.routes.ts           # /api/auth (Login, Signup, Profile, Demo Accounts)
│       │   ├── tasks.routes.ts          # /api/tasks (Create, Update, Status, Reorder, Comments)
│       │   ├── projects.routes.ts       # /api/projects (CRUD, Members, Progress)
│       │   ├── teams.routes.ts          # /api/teams (CRUD, Members, Leads)
│       │   ├── calendar.routes.ts       # /api/calendar (Multi-filter task queries)
│       │   ├── chat.routes.ts           # /api/chat (Channels, DMs, Messages)
│       │   ├── attachments.routes.ts    # /api/attachments (BLOB upload & streaming retrieval)
│       │   ├── notifications.routes.ts  # /api/notifications (Fetch & mark read)
│       │   ├── search.routes.ts         # /api/search (Global search across entities)
│       │   └── activity.routes.ts       # /api/activity (Task audit history)
│       ├── services\
│       │   ├── auth.service.ts          # User registration, password hashing, JWT issue
│       │   ├── task.service.ts          # Task lifecycle, atomic status updates, subtasks
│       │   ├── project.service.ts       # Project progress calculation, member management
│       │   ├── team.service.ts          # Team allocations
│       │   ├── chat.service.ts          # Message creation, mentions parsing, channel creation
│       │   ├── attachment.service.ts    # DB BLOB storage and streaming queries
│       │   └── search.service.ts        # Unified cross-entity search index
│       └── events\
│           ├── dispatcher.ts            # Central Event Dispatcher (Typed event bus)
│           ├── types.ts                 # Domain event definitions and payloads
│           └── handlers\
│               ├── activity.handler.ts      # Writes audit trail records
│               ├── notification.handler.ts  # Evaluates notification rules & generates alerts
│               └── socket.handler.ts        # Emits live WebSocket events to client rooms
│
└── frontend\
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src\
        ├── styles\
        │   ├── design-tokens.css        # Rich dark/light palette, glassmorphism, HSL colors
        │   ├── global.css               # Typography (Inter/Outfit), resets, responsive layout
        │   ├── components.css           # Badges, modals, cards, buttons, dropdowns
        │   └── animations.css           # Micro-transitions, drag shadows, pulse alerts
        ├── types\                       # Shared TypeScript interfaces
        ├── context\
        │   ├── AuthContext.tsx           # Session state, JWT token, user info, login/logout/signup
        │   ├── TaskContext.tsx           # Central task store, optimistic updates, socket listeners
        │   └── NotificationContext.tsx   # Live notifications & unread counter
        ├── components\
        │   ├── layout\
        │   │   ├── AppLayout.tsx         # Sidebar, topbar, role indicator, content shell
        │   │   ├── Sidebar.tsx           # Navigation links with live badge counts
        │   │   ├── Header.tsx            # Global search trigger (Ctrl+K), notification bell, profile
        │   │   └── GlobalSearchModal.tsx # Full search modal across all entities
        │   ├── common\
        │   │   ├── PriorityBadge.tsx
        │   │   ├── StatusBadge.tsx
        │   │   ├── Avatar.tsx
        │   │   └── Modal.tsx
        │   ├── tasks\
        │   │   ├── TaskDetailModal.tsx   # Subtasks, comments, attachments, activity log timeline
        │   │   ├── TaskCreateModal.tsx   # Full creation form (assignee, dates, priority, team)
        │   │   └── TaskCard.tsx          # Card with draggable attributes, badges, due date alert
        │   └── chat\
        │       ├── ChatWindow.tsx        # Real-time chat with channel switcher & DM list
        │       └── AttachmentPreview.tsx # Media & document renderer from DB BLOB
        ├── pages\
        │   ├── LoginPage.tsx             # Full login screen + quick demo account presets
        │   ├── SignupPage.tsx            # Full sign-up registration screen
        │   ├── Dashboard.tsx             # Pending, due today, overdue, project progress bars
        │   ├── ProjectsPage.tsx          # Project cards, team allocation, progress %
        │   ├── KanbanBoard.tsx           # 5-column drag-and-drop board with cross-module sync
        │   ├── CalendarPage.tsx          # Month/Week/Day + multi-faceted filter toolbar
        │   ├── MyWorkPage.tsx            # Today, Upcoming, Overdue, Completed personal view
        │   ├── ChatPage.tsx              # DMs + Project channels (General, Dev, Ops)
        │   ├── TeamManagementPage.tsx    # Admin/PM member & team assignment
        │   └── ActivityPage.tsx          # Comprehensive task audit trail
        └── App.tsx                       # React router, protected routes, theme provider
```

---

## Database Schema Design (SQLite with BLOB Attachments)

- **`users`**: `id`, `name`, `email`, `password_hash`, `role` (`ADMIN`, `PROJECT_MANAGER`, `TEAM_MEMBER`), `avatar_url`, `created_at`
- **`teams`**: `id`, `name`, `description`, `lead_id`, `created_at`
- **`team_members`**: `team_id`, `user_id`
- **`projects`**: `id`, `name`, `description`, `team_id`, `manager_id`, `status`, `created_at`
- **`project_members`**: `project_id`, `user_id`, `role_in_project`
- **`tasks`**:
  - `id`, `title`, `description`, `project_id`, `team_id`, `assignee_id`, `creator_id`
  - `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
  - `status` (`TODO`, `IN_PROGRESS`, `REVIEW`, `BLOCKED`, `COMPLETED`)
  - `start_date`, `due_date`, `position_order`, `created_at`, `updated_at`
- **`subtasks`**: `id`, `task_id`, `title`, `is_completed`, `position`
- **`task_comments`**: `id`, `task_id`, `user_id`, `content`, `created_at`
- **`attachments`**:
  - `id`, `entity_type` (`TASK`, `COMMENT`, `CHAT`), `entity_id`
  - `file_name` TEXT, `mime_type` TEXT, `file_size` INTEGER
  - `data` BLOB (stored directly in DB)
  - `uploaded_by` INTEGER, `created_at` TEXT
- **`activity_logs`**: `id`, `task_id`, `project_id`, `actor_id`, `action_type`, `old_value`, `new_value`, `description`, `created_at`
- **`notifications`**: `id`, `recipient_id`, `actor_id`, `type`, `title`, `message`, `entity_type`, `entity_id`, `is_read`, `created_at`
- **`chat_channels`**: `id`, `project_id`, `name` (e.g., "General", "Development", "Operations"), `is_direct`, `created_at`
- **`chat_channel_members`**: `channel_id`, `user_id`
- **`chat_messages`**: `id`, `channel_id`, `sender_id`, `content`, `mentions_json`, `created_at`

---

## Detailed PRD Module Implementation

### 1. Authentication & RBAC (PRD Section 2)
- **Screens**: Dedicated `/login` and `/signup` pages with real password hashing (`bcryptjs`) and secure JWT session management.
- **Seeded Accounts**:
  - `admin@upsow.com` (Admin)
  - `pm@upsow.com` (Project Manager)
  - `saad@upsow.com` (Developer / Team Member)
  - `ali@upsow.com` (Operations / Team Member)
  - `sarah@upsow.com` (Designer / Team Member)
- Quick "1-Click Demo Fill" presets on the login screen for testing each role immediately.
- Role-based permissions enforced at Route & Service levels.

### 2. Central Task Engine & Core Synchronization (PRD Sections 13 & 14)
- **Lifecycle Flow**:
  1. Client updates task (e.g. moves card on Kanban, checks complete in My Work).
  2. `tasks.routes.ts` validates payload and calls `TaskService.updateStatus()`.
  3. `TaskService` runs an SQLite transaction updating `tasks.status` and `tasks.updated_at`.
  4. `TaskService` calls `eventDispatcher.dispatch(TaskEvents.STATUS_CHANGED, payload)`.
  5. Handlers run:
     - `activity.handler` writes an audit entry: *"Saad changed status from In Progress to Review"*.
     - `notification.handler` checks rules and creates notifications for assignees/PM.
     - `socket.handler` emits `task:status_changed` to project room.
  6. Frontend `TaskContext` receives socket event and updates central cache; Kanban, Calendar, Dashboard, and My Work all reflect the new state instantly.

### 3. Database-Backed BLOB Attachments
- Multer processes file buffer in-memory and passes it to `AttachmentService.saveAttachment()`.
- Inserted into the `attachments` table as binary `BLOB`.
- Served via authenticated streaming route `GET /api/attachments/:id` with appropriate `Content-Type` headers for direct in-browser image/PDF rendering or download.

### 4. Kanban Board (PRD Section 4)
- 5 columns: **To Do** → **In Progress** → **Review** → **Blocked** → **Completed**.
- HTML5 Drag-and-Drop with card lift styling, drop zone indicators, and optimistic UI transitions.
- Displays priority pill, assignee avatar, subtask completion counter, attachment counter, and overdue badge.

### 5. Shared Calendar (PRD Section 5)
- Views: **Month**, **Week**, and **Day**.
- Multi-faceted filter toolbar supporting simultaneous queries:
  - **Project**: *All Projects* or *UPSOW*
  - **Team**: *All Teams* or *Development* / *Operations* / *Design*
  - **Person**: *Everyone* or *Saad* / *Ali* / *Sarah*
  - **Status**: *All* or specific statuses
- Rendered accurately based on `start_date` and `due_date`. Clicking opens the task detail modal.

### 6. My Work (PRD Section 6)
- Personal focused workspace partitioned into:
  - **Today**: Tasks due today
  - **Upcoming**: Future tasks
  - **Overdue**: Tasks past deadline (with high-visibility amber/rose alerts)
  - **Completed**: Recently completed
- Inline status dropdown allowing direct one-click transitions without leaving the page.

### 7. Internal Chat (PRD Section 8)
- **Direct Messages**: 1-on-1 private messaging.
- **Project Groups**: Linked to projects (e.g., `UPSOW #general`, `UPSOW #development`, `UPSOW #operations`).
- Supports text formatting, `@mentions` with autocomplete, file attachments stored in DB, and unread badges.

### 8. Notifications & Reminders (PRD Section 7)
- Automated rule triggers:
  - Task assigned / reassigned
  - Tagged / mentioned in comment or chat
  - Deadline reminders (3 days before, 1 day before, due today, overdue)
  - Status changes
- Header notification center with unread badge and "Mark all as read".

### 9. Global Search (PRD Section 9)
- Triggered anywhere via `Ctrl+K` or search bar.
- Searches across Tasks, Projects, Teams, Users, and Chat Messages with highlighted matches.

---


### DEVELOPER INPUT AND RECOMMENDATION
1. Fix the transaction/event boundary

Right now you say:

TaskService runs an SQLite transaction ... then calls eventDispatcher.dispatch()

Make it explicitly:

Route
 ↓
Service
 ↓
BEGIN TRANSACTION
 ↓
DB mutations
 ↓
COMMIT
 ↓
Event Dispatcher
 ├── Activity
 ├── Notifications
 └── Socket.io

Do not dispatch socket/notification events before the transaction commits.

Otherwise a transaction can fail while clients have already been told that the task changed.

For the MVP, this is enough. You don't need an outbox/event-sourcing architecture yet.

2. Add a task_watchers table

Your notification design mentions:

assignees/watchers

But there is no watcher table in the schema.

Add:

task_watchers
- task_id
- user_id
- created_at
PRIMARY KEY (task_id, user_id)

Then you can properly notify:

assignee
creator
watchers
relevant PM
mentioned users

without hardcoding notification recipients.

3. Add indexes

SQLite will be fine for this MVP, but your schema should explicitly create indexes on the fields you're going to query constantly.

At minimum:

tasks(project_id)
tasks(team_id)
tasks(assignee_id)
tasks(status)
tasks(due_date)
tasks(updated_at)

activity_logs(task_id)
activity_logs(project_id)
activity_logs(created_at)

notifications(recipient_id, is_read)
notifications(created_at)

chat_messages(channel_id, created_at)
chat_channel_members(user_id)

project_members(user_id)
team_members(user_id)

attachments(entity_type, entity_id)

This becomes particularly important for Calendar, My Work, notifications and Chat.

4. Be careful with SQLite BLOB attachments

Your decision is perfectly reasonable for this MVP, but tell Antigravity to enforce limits.

For example:

Maximum attachment size: 10 MB
Allowed:
- images
- PDF
- common office documents
- text files

And importantly:

Never trust the client-provided MIME type alone.

At minimum validate extension + MIME type + file size server-side.

Also, don't load a massive BLOB unnecessarily when the user only needs metadata. Your attachment listing endpoint should return metadata, while the actual BLOB is retrieved only through the authenticated attachment endpoint.

One architectural addition I'd strongly recommend

Add a shared API response/error format.

For example:

{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task does not exist"
  }
}

and:

{
  "success": true,
  "data": {}
}

This will make your React frontend much easier to maintain.

Also define domain error codes such as:

AUTH_REQUIRED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
TASK_NOT_FOUND
PROJECT_NOT_FOUND
INVALID_STATUS_TRANSITION
ATTACHMENT_TOO_LARGE
ATTACHMENT_TYPE_NOT_ALLOWED

## Verification Plan

### Automated Verification
1. **Backend Integration Suite**:
   - `npm run test` in `backend/` verifying:
     - Route → Service → Transaction → Event Dispatcher pipeline
     - User signup and login JWT issuance
     - Task creation, status change, and automatic activity history generation
     - Multi-filter calendar queries (`project`, `team`, `assignee`, `status`)
     - Attachment BLOB storage and streaming retrieval
2. **Frontend Build**:
   - `npm run build` in `frontend/` ensuring clean TypeScript compilation and asset bundling.

### Manual Verification (PRD Success Criteria)
1. **End-to-End Task Lifecycle**:
   - Login as PM (`pm@upsow.com`) -> Create task in project UPSOW -> Assign to Saad -> Set dates -> Attach document.
   - Switch user to Saad (`saad@upsow.com`) -> Check My Work & Notifications -> Open task -> Add comment -> Move card to In Progress on Kanban.
   - Verify activity history records the change -> Move card to Completed -> Verify dashboard metrics update.
2. **Multi-Filter Calendar Test**:
   - Filter by Project: UPSOW, Team: Development, Person: Saad -> verify only matching tasks appear.
3. **Chat & Real-time Synchronization**:
   - Send message in `UPSOW #development` with `@Saad`, verify live message delivery.
