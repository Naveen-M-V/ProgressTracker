import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Trash2,
  CheckSquare,
  MessageSquare,
  History,
  Send,
  Plus,
  Edit2,
  Check,
  Layers,
  Paperclip,
  Download,
  FileText,
  UploadCloud,
  Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTasks } from '../../context/TaskContext.js';
import { TaskDetail, TaskStatus, TaskPriority, Subtask } from '../../types/task.js';
import { UserAvatar } from '../common/UserAvatar.js';
import { RoleBadge } from '../common/RoleBadge.js';

interface TaskDetailModalProps {
  taskId: number | null;
  onClose: () => void;
}

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const { token } = useAuth();
  const {
    fetchTaskDetail,
    updateTask,
    updateTaskStatus,
    assignTask,
    deleteTask,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addComment,
    uploadAttachment,
    deleteAttachment,
    users
  } = useTasks();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'comments' | 'attachments' | 'activity'>('checklist');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Title & description editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // Subtask & Comment inputs
  const [subtaskInput, setSubtaskInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);
    const detail = await fetchTaskDetail(taskId);
    if (detail) {
      setTask(detail);
      setTitleDraft(detail.title);
      setDescDraft(detail.description || '');
    }
    setIsLoading(false);
  }, [taskId, fetchTaskDetail]);

  useEffect(() => {
    if (taskId) {
      loadDetails();
      setShowDeleteConfirm(false);
    } else {
      setTask(null);
    }
  }, [taskId, loadDetails]);

  if (!taskId) return null;

  // Title save
  const handleSaveTitle = async () => {
    if (!task || !titleDraft.trim() || titleDraft.trim() === task.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      const updated = await updateTask(task.id, { title: titleDraft.trim() });
      if (updated) {
        setTask((prev) => (prev ? { ...prev, title: updated.title } : prev));
      }
    } finally {
      setIsEditingTitle(false);
    }
  };

  // Description save
  const handleSaveDesc = async () => {
    if (!task) return;
    try {
      const updated = await updateTask(task.id, { description: descDraft.trim() });
      if (updated) {
        setTask((prev) => (prev ? { ...prev, description: updated.description } : prev));
      }
    } finally {
      setIsEditingDesc(false);
    }
  };

  // Status change
  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task) return;
    const ok = await updateTaskStatus(task.id, newStatus);
    if (ok) {
      setTask((prev) => (prev ? { ...prev, status: newStatus } : prev));
      loadDetails(); // refresh activity log
    }
  };

  // Priority change
  const handlePriorityChange = async (newPriority: TaskPriority) => {
    if (!task) return;
    const updated = await updateTask(task.id, { priority: newPriority });
    if (updated) {
      setTask((prev) => (prev ? { ...prev, priority: newPriority } : prev));
      loadDetails();
    }
  };

  // Reassign
  const handleAssigneeChange = async (newAssigneeId: number | null) => {
    if (!task) return;
    const ok = await assignTask(task.id, newAssigneeId);
    if (ok) {
      loadDetails();
    }
  };

  // Subtask actions
  const handleAddSubtaskItem = async () => {
    if (!task || !subtaskInput.trim()) return;
    const added = await addSubtask(task.id, subtaskInput.trim());
    if (added) {
      setTask((prev) =>
        prev ? { ...prev, subtasks: [...prev.subtasks, added], subtask_count: (prev.subtask_count || 0) + 1 } : prev
      );
      setSubtaskInput('');
    }
  };

  const handleToggleSubtaskItem = async (sub: Subtask) => {
    if (!task) return;
    const ok = await toggleSubtask(sub.id, !sub.is_completed, task.id);
    if (ok) {
      setTask((prev) => {
        if (!prev) return prev;
        const updatedSubs = prev.subtasks.map((s) =>
          s.id === sub.id ? { ...s, is_completed: !s.is_completed } : s
        );
        const compCount = updatedSubs.filter((s) => s.is_completed).length;
        return {
          ...prev,
          subtasks: updatedSubs,
          subtasks_completed: compCount
        };
      });
    }
  };

  const handleDeleteSubtaskItem = async (subId: number) => {
    if (!task) return;
    const ok = await deleteSubtask(subId, task.id);
    if (ok) {
      setTask((prev) => {
        if (!prev) return prev;
        const updatedSubs = prev.subtasks.filter((s) => s.id !== subId);
        const compCount = updatedSubs.filter((s) => s.is_completed).length;
        return {
          ...prev,
          subtasks: updatedSubs,
          subtask_count: updatedSubs.length,
          subtasks_completed: compCount
        };
      });
    }
  };

  // Comment action
  const handlePostComment = async () => {
    if (!task || !commentInput.trim()) return;
    setIsSendingComment(true);
    const comment = await addComment(task.id, commentInput.trim());
    if (comment) {
      setTask((prev) =>
        prev
          ? {
              ...prev,
              comments: [comment, ...prev.comments],
              comment_count: (prev.comment_count || 0) + 1
            }
          : prev
      );
      setCommentInput('');
    }
    setIsSendingComment(false);
  };

  // Delete task action
  const handleDeleteTask = async () => {
    if (!task) return;
    const ok = await deleteTask(task.id);
    if (ok) {
      onClose();
    }
  };

  // Attachment upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!task || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadAttachment(task.id, file);
      if (uploaded) {
        setTask((prev) =>
          prev
            ? {
                ...prev,
                attachments: [uploaded, ...(prev.attachments || [])],
                attachment_count: (prev.attachment_count || 0) + 1
              }
            : prev
        );
        loadDetails();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Attachment delete
  const handleDeleteAttachmentItem = async (attId: number) => {
    if (!task) return;
    const ok = await deleteAttachment(attId, task.id);
    if (ok) {
      setTask((prev) =>
        prev
          ? {
              ...prev,
              attachments: (prev.attachments || []).filter((a) => a.id !== attId),
              attachment_count: Math.max(0, (prev.attachment_count || 1) - 1)
            }
          : prev
      );
      loadDetails();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const subtasksTotal = task?.subtasks?.length || 0;
  const subtasksDone = task?.subtasks?.filter((s) => s.is_completed).length || 0;
  const subtasksPercentage = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

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
          maxWidth: '920px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 69, 0.4) 0%, rgba(17, 24, 39, 0.2) 100%)',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: 'var(--brand-secondary)',
                fontWeight: 700,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(59, 130, 246, 0.25)'
              }}
            >
              #TASK-{task ? task.id : taskId}
            </span>

            {task && (
              <>
                {/* Status Selector */}
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="REVIEW">In Review</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="COMPLETED">Completed</option>
                </select>

                {/* Priority Selector */}
                <select
                  value={task.priority}
                  onChange={(e) => handlePriorityChange(e.target.value as TaskPriority)}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
                >
                  <option value="LOW">Low Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">Urgent Priority</option>
                </select>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Delete button */}
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)'
                }}
                title="Delete task"
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
              >
                <Trash2 size={18} />
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#f87171' }}>Delete?</span>
                <button
                  onClick={handleDeleteTask}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

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
        </div>

        {/* Modal Main Content (2 Panes: Left 65%, Right 35%) */}
        {isLoading || !task ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading task details...
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflowY: 'auto' }}>
            {/* Left Main Pane */}
            <div
              style={{
                flex: '1 1 60%',
                padding: '24px',
                borderRight: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                overflowY: 'auto'
              }}
            >
              {/* Editable Title */}
              <div>
                {isEditingTitle ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') setIsEditingTitle(false);
                      }}
                      autoFocus
                      style={{
                        flex: 1,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-focus)',
                        borderRadius: 'var(--radius-md)',
                        padding: '6px 10px',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button onClick={handleSaveTitle} className="btn-primary" style={{ padding: '6px 12px' }}>
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingTitle(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      marginLeft: '-6px'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                      {task.title}
                    </h2>
                    <Edit2 size={16} color="var(--text-muted)" style={{ marginTop: '4px', flexShrink: 0 }} />
                  </div>
                )}
              </div>

              {/* Editable Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Description
                </label>
                {isEditingDesc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      rows={4}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-focus)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        lineHeight: 1.4
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setIsEditingDesc(false)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveDesc}
                        className="btn-primary"
                        style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingDesc(true)}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'rgba(17, 24, 39, 0.4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      minHeight: '60px',
                      color: task.description ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-glass)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  >
                    {task.description || 'Add a more detailed description or notes...'}
                  </div>
                )}
              </div>

              {/* Tab Navigation (Checklist, Comments, Activity) */}
              <div style={{ borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => setActiveTab('checklist')}
                  style={{
                    background: 'transparent',
                    borderBottom: activeTab === 'checklist' ? '2px solid var(--brand-secondary)' : '2px solid transparent',
                    color: activeTab === 'checklist' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    padding: '8px 4px',
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckSquare size={16} />
                  Checklist ({subtasksDone}/{subtasksTotal})
                </button>

                <button
                  onClick={() => setActiveTab('comments')}
                  style={{
                    background: 'transparent',
                    borderBottom: activeTab === 'comments' ? '2px solid var(--brand-secondary)' : '2px solid transparent',
                    color: activeTab === 'comments' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    padding: '8px 4px',
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <MessageSquare size={16} />
                  Comments ({task.comments?.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab('attachments')}
                  style={{
                    background: 'transparent',
                    borderBottom: activeTab === 'attachments' ? '2px solid var(--brand-secondary)' : '2px solid transparent',
                    color: activeTab === 'attachments' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    padding: '8px 4px',
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <Paperclip size={16} />
                  Attachments ({task.attachments?.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab('activity')}
                  style={{
                    background: 'transparent',
                    borderBottom: activeTab === 'activity' ? '2px solid var(--brand-secondary)' : '2px solid transparent',
                    color: activeTab === 'activity' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    padding: '8px 4px',
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <History size={16} />
                  Audit Trail ({task.activity_logs?.length || 0})
                </button>
              </div>

              {/* TAB 1: Checklist / Subtasks */}
              {activeTab === 'checklist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Progress Bar */}
                  {subtasksTotal > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        <span>Progress</span>
                        <span>{subtasksPercentage}% completed</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${subtasksPercentage}%`,
                            height: '100%',
                            backgroundColor: subtasksPercentage === 100 ? 'var(--status-completed)' : 'var(--brand-secondary)',
                            transition: 'width var(--transition-normal)'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Add Subtask Input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Add subtask item..."
                      value={subtaskInput}
                      onChange={(e) => setSubtaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubtaskItem();
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
                      onClick={handleAddSubtaskItem}
                      className="btn-secondary"
                      style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>

                  {/* Subtask items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {task.subtasks?.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                        No checklist items yet. Add subtasks to track progress.
                      </p>
                    ) : (
                      task.subtasks.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            backgroundColor: 'rgba(23, 32, 54, 0.4)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-subtle)',
                            transition: 'all var(--transition-fast)'
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: 'pointer',
                              flex: 1,
                              userSelect: 'none'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={sub.is_completed}
                              onChange={() => handleToggleSubtaskItem(sub)}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                fontSize: '0.88rem',
                                color: sub.is_completed ? 'var(--text-muted)' : 'var(--text-primary)',
                                textDecoration: sub.is_completed ? 'line-through' : 'none'
                              }}
                            >
                              {sub.title}
                            </span>
                          </label>

                          <button
                            onClick={() => handleDeleteSubtaskItem(sub.id)}
                            style={{
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              padding: '4px',
                              borderRadius: 'var(--radius-sm)'
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Comments & Discussions */}
              {activeTab === 'comments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* New Comment Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      rows={3}
                      placeholder="Write a comment or status update..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        resize: 'vertical'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handlePostComment}
                        className="btn-primary"
                        disabled={isSendingComment || !commentInput.trim()}
                        style={{ padding: '6px 14px', fontSize: '0.825rem' }}
                      >
                        <Send size={14} />
                        {isSendingComment ? 'Posting...' : 'Post Comment'}
                      </button>
                    </div>
                  </div>

                  {/* Comment List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {task.comments?.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                        No comments yet. Start the discussion!
                      </p>
                    ) : (
                      task.comments.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: '12px 14px',
                            backgroundColor: 'rgba(23, 32, 54, 0.4)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <UserAvatar name={c.user_name} avatarUrl={c.user_avatar} size={22} />
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {c.user_name}
                              </span>
                              <RoleBadge role={c.user_role} size="sm" />
                            </div>
                            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                              {new Date(c.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                            {c.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: Activity Logs / Audit Trail */}
              {activeTab === 'activity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {task.activity_logs?.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                      No activity logs recorded yet.
                    </p>
                  ) : (
                    task.activity_logs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '8px 12px',
                          backgroundColor: 'rgba(17, 24, 39, 0.3)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.825rem'
                        }}
                      >
                        <History size={14} color="var(--brand-secondary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.actor_name}</span>{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>{log.description}</span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {new Date(log.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: Attachments (Phase 7) */}
              {activeTab === 'attachments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* File Upload Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '24px 16px',
                      textAlign: 'center',
                      backgroundColor: 'rgba(23, 32, 54, 0.35)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.zip"
                    />
                    <UploadCloud size={28} color="var(--brand-secondary)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {isUploading ? 'Uploading binary to SQLite...' : 'Click to browse or drop files to attach'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Stored directly as SQLite BLOB: PNG, JPG, GIF, SVG, PDF, DOCX, TXT, CSV, JSON, ZIP (up to 10MB)
                    </div>
                  </div>

                  {uploadError && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#f87171',
                        fontSize: '0.8rem'
                      }}
                    >
                      {uploadError}
                    </div>
                  )}

                  {/* Attachments List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {task.attachments?.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                        No attachments uploaded yet. Attach files above to store them in the project database.
                      </p>
                    ) : (
                      task.attachments?.map((att) => {
                        const isImg = att.mime_type.startsWith('image/');
                        const fileUrl = `/api/attachments/${att.id}?token=${token || ''}`;
                        const downloadUrl = `/api/attachments/${att.id}?download=true&token=${token || ''}`;

                        return (
                          <div
                            key={att.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              backgroundColor: 'rgba(23, 32, 54, 0.5)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-md)',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                              {isImg ? (
                                <div
                                  onClick={() => setPreviewImage(fileUrl)}
                                  style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: 'var(--radius-sm)',
                                    overflow: 'hidden',
                                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                  }}
                                  title="Click to view full preview"
                                >
                                  <img
                                    src={fileUrl}
                                    alt={att.file_name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                </div>
                              ) : (
                                <div
                                  style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  <FileText size={20} color="var(--brand-secondary)" />
                                </div>
                              )}

                              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div
                                  style={{
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={att.file_name}
                                >
                                  {att.file_name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                                  <span>{formatFileSize(att.file_size)}</span>
                                  <span>•</span>
                                  <span>{att.uploader_name || 'User'}</span>
                                  <span>•</span>
                                  <span>{new Date(att.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              {isImg && (
                                <button
                                  onClick={() => setPreviewImage(fileUrl)}
                                  className="btn-secondary"
                                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                                  title="Preview Image"
                                >
                                  <Eye size={14} /> Preview
                                </button>
                              )}

                              <a
                                href={downloadUrl}
                                download={att.file_name}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary"
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '0.75rem',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Download Attachment"
                              >
                                <Download size={14} /> Download
                              </a>

                              <button
                                onClick={() => handleDeleteAttachmentItem(att.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#f87171',
                                  cursor: 'pointer',
                                  padding: '6px',
                                  borderRadius: 'var(--radius-sm)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="Delete Attachment"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Meta Sidebar (35%) */}
            <div
              style={{
                flex: '1 1 40%',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                backgroundColor: 'rgba(17, 24, 39, 0.25)',
                overflowY: 'auto'
              }}
            >
              {/* Assignee Card */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Assignee
                </label>
                <select
                  value={task.assignee_id || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
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

              {/* Project & Team */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Project & Team
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                    <Layers size={14} color="var(--brand-secondary)" />
                    <span style={{ fontWeight: 600 }}>{task.project_name || `Project #${task.project_id}`}</span>
                  </div>
                  {task.team_name && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
                      Team: {task.team_name}
                    </div>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Timeline & Dates
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.825rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Due Date:</span>
                    <span style={{ fontWeight: 600, color: task.due_date ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Not set'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Created:</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Watchers */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Watchers ({task.watchers?.length || 0})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {task.watchers?.map((w) => (
                    <div
                      key={w.user_id}
                      title={w.user_name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem'
                      }}
                    >
                      <UserAvatar name={w.user_name} size={18} />
                      <span>{w.user_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Image Lightbox Modal */}
        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(10px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}
            >
              <button
                onClick={() => setPreviewImage(null)}
                style={{
                  position: 'absolute',
                  top: '-14px',
                  right: '-14px',
                  backgroundColor: 'rgba(23, 32, 54, 0.95)',
                  border: '1px solid var(--border-glass)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                <X size={18} />
              </button>
              <img
                src={previewImage}
                alt="Attachment Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '85vh',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
