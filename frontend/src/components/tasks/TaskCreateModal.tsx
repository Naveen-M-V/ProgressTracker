import { useState, useEffect, useMemo, FormEvent } from 'react';
import { X, Plus, Trash2, CheckSquare, Layers, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTasks } from '../../context/TaskContext.js';
import { TaskStatus, TaskPriority, ItemType } from '../../types/task.js';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStatus?: TaskStatus;
  initialDueDate?: string;
  initialItemType?: ItemType;
}

export function TaskCreateModal({
  isOpen,
  onClose,
  initialStatus = 'TODO',
  initialDueDate,
  initialItemType = 'TASK'
}: TaskCreateModalProps) {
  const {
    projects,
    teams,
    users,
    selectedProject,
    createTask
  } = useTasks();
  const { user } = useAuth();

  const availableTeams = useMemo(() => {
    if (!user || user.role === 'ADMIN' || user.role === 'PROJECT_MANAGER') {
      return teams;
    }
    return teams.filter((t) => t.is_member);
  }, [teams, user]);

  const [itemType, setItemType] = useState<ItemType>(initialItemType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<number>(selectedProject?.id || 1);
  const [teamId, setTeamId] = useState<number | ''>('');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Checklist items
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync initial status, project, due date, and item type
  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
    if (selectedProject) setProjectId(selectedProject.id);
    if (initialDueDate) {
      setDueDate(initialDueDate);
      setStartDate(initialDueDate);
    }
    if (initialItemType) {
      setItemType(initialItemType);
    }
  }, [initialStatus, selectedProject, initialDueDate, initialItemType]);

  if (!isOpen) return null;

  const handleAddSubtask = () => {
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    setSubtasks([...subtasks, trimmed]);
    setSubtaskInput('');
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg(itemType === 'EVENT' ? 'Event title is required' : 'Task title is required');
      return;
    }
    if (!projectId) {
      setErrorMsg('Please select a project');
      return;
    }
    if (itemType === 'EVENT' && !dueDate) {
      setErrorMsg('Event date is required');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        project_id: projectId,
        team_id: teamId ? Number(teamId) : null,
        assignee_id: assigneeId ? Number(assigneeId) : null,
        priority,
        status: itemType === 'EVENT' ? 'TODO' : status,
        start_date: itemType === 'EVENT' ? null : (startDate || null),
        due_date: dueDate || null,
        item_type: itemType,
        subtasks: itemType === 'TASK' && subtasks.length > 0 ? subtasks : undefined
      });

      // Reset form & close
      setTitle('');
      setDescription('');
      setSubtasks([]);
      setStartDate('');
      setDueDate('');
      setTeamId('');
      setAssigneeId('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || (itemType === 'EVENT' ? 'Failed to create event' : 'Failed to create task'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-glass"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: itemType === 'EVENT'
              ? 'linear-gradient(180deg, rgba(88, 28, 135, 0.35) 0%, rgba(17, 24, 39, 0.2) 100%)'
              : 'linear-gradient(180deg, rgba(30, 41, 69, 0.4) 0%, rgba(17, 24, 39, 0.2) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: itemType === 'EVENT' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                border: itemType === 'EVENT' ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(37, 99, 235, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: itemType === 'EVENT' ? '#c084fc' : 'var(--brand-secondary)'
              }}
            >
              {itemType === 'EVENT' ? <Calendar size={18} /> : <Layers size={18} />}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                {itemType === 'EVENT' ? 'Create New Event' : 'Create New Task'}
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                {itemType === 'EVENT'
                  ? 'Schedule a single-date milestone, client demo, release, or meeting'
                  : 'Define deliverables, assign responsibility, and plan timeline'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              padding: '6px',
              borderRadius: 'var(--radius-sm)'
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Item Type Switcher: Task vs Event */}
        <div style={{ padding: '16px 24px 0 24px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              gap: '6px'
            }}
          >
            <button
              type="button"
              onClick={() => setItemType('TASK')}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: itemType === 'TASK' ? 'var(--brand-primary)' : 'transparent',
                border: 'none',
                color: itemType === 'TASK' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)'
              }}
            >
              <Layers size={15} />
              <span>Task (Timeline & Checklist)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setItemType('EVENT');
                setStartDate(''); // Events only have a single date
              }}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: itemType === 'EVENT' ? '#9333ea' : 'transparent',
                border: 'none',
                color: itemType === 'EVENT' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)'
              }}
            >
              <Calendar size={15} />
              <span>Event (Single Date)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {errorMsg && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#f87171',
                fontSize: '0.85rem'
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              {itemType === 'EVENT' ? 'Event Title' : 'Task Title'} <span style={{ color: 'var(--status-blocked)' }}>*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder={itemType === 'EVENT' ? 'e.g. Q3 Roadmap Review, Client Demo, Release v2.0' : 'e.g. Implement user authentication & JWT flow'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: '0.95rem'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              {itemType === 'EVENT' ? 'Event Details / Agenda' : 'Description'}
            </label>
            <textarea
              rows={3}
              placeholder={itemType === 'EVENT' ? 'Provide event agenda, conference link, or details...' : 'Provide context, acceptance criteria, or relevant links...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'vertical',
                minHeight: '80px'
              }}
            />
          </div>

          {/* Project & Team Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Project <span style={{ color: 'var(--status-blocked)' }}>*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Team Assignment (Optional)
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">No Team Assigned</option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority & Status Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {/* Priority Selector Pills */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                Priority
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.3)' : 'var(--bg-tertiary)',
                        border: isSelected ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
                        color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Dropdown */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                {itemType === 'EVENT' ? 'Event Status' : 'Initial Status'}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem'
                }}
              >
                {itemType === 'EVENT' ? (
                  <>
                    <option value="TODO">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                  </>
                ) : (
                  <>
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="REVIEW">In Review</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="COMPLETED">Completed</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Assignee & Dates Grid */}
          {itemType === 'EVENT' ? (
            /* EVENT: Single Date and Host/Organizer */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Organizer / Host (Optional)
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">No Host Assigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Event Date <span style={{ color: 'var(--status-blocked)' }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setStartDate('');
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    colorScheme: 'dark'
                  }}
                />
              </div>
            </div>
          ) : (
            /* TASK: Assignee, Start Date, Due Date */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    colorScheme: 'dark'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    colorScheme: 'dark'
                  }}
                />
              </div>
            </div>
          )}

          {/* Subtasks Checklist Builder - Tasks Only */}
          {itemType === 'TASK' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckSquare size={15} color="var(--brand-secondary)" />
                  Checklist / Subtasks ({subtasks.length})
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Add actionable subtask item..."
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                >
                  <Plus size={16} /> Add
                </button>
              </div>

              {subtasks.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: 'rgba(17, 24, 39, 0.4)',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  {subtasks.map((sub, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        backgroundColor: 'rgba(30, 41, 69, 0.4)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)' }}>• {sub}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(index)}
                        style={{
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          padding: '2px'
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '8px'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{
                minWidth: '135px',
                backgroundColor: itemType === 'EVENT' ? '#9333ea' : undefined,
                borderColor: itemType === 'EVENT' ? '#a855f7' : undefined
              }}
            >
              {isSubmitting ? 'Creating...' : itemType === 'EVENT' ? 'Create Event' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
