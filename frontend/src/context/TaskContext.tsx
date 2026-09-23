import { createContext, useContext, useState, useEffect, useCallback, ReactNode, Dispatch, SetStateAction } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import {
  Task,
  TaskDetail,
  TaskStatus,
  TaskPriority,
  CreateTaskPayload,
  UpdateTaskPayload,
  Subtask,
  TaskComment
} from '../types/task.js';
import { TaskAttachment } from '../types/attachment.js';
import { Project } from '../types/project.js';
import { Team } from '../types/team.js';
import { User } from '../types/auth.js';

export interface TaskFilterOptions {
  project_id?: number | 'all';
  team_id?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: number | 'unassigned';
  due_date?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
}

interface TaskContextType {
  tasks: Task[];
  projects: Project[];
  teams: Team[];
  users: User[];
  selectedProject: Project | null;
  selectedTaskId: number | null;
  isCreateModalOpen: boolean;
  isProjectCreateModalOpen: boolean;
  isLoadingTasks: boolean;
  filters: TaskFilterOptions;
  socketConnected: boolean;

  setSelectedProject: (project: Project | null) => void;
  setSelectedTaskId: (id: number | null) => void;
  setIsCreateModalOpen: (open: boolean) => void;
  setIsProjectCreateModalOpen: (open: boolean) => void;
  setFilters: Dispatch<SetStateAction<TaskFilterOptions>>;
  resetFilters: () => void;

  createProject: (payload: { name: string; description?: string; team_id?: number | null; manager_id?: number | null }) => Promise<Project | null>;
  createTask: (payload: CreateTaskPayload) => Promise<Task | null>;
  updateTask: (taskId: number, payload: UpdateTaskPayload) => Promise<Task | null>;
  updateTaskStatus: (taskId: number, status: TaskStatus, position_order?: number) => Promise<boolean>;
  assignTask: (taskId: number, assigneeId: number | null) => Promise<boolean>;
  deleteTask: (taskId: number) => Promise<boolean>;
  addSubtask: (taskId: number, title: string) => Promise<Subtask | null>;
  toggleSubtask: (subtaskId: number, isCompleted: boolean, taskId: number) => Promise<boolean>;
  deleteSubtask: (subtaskId: number, taskId: number) => Promise<boolean>;
  addComment: (taskId: number, content: string) => Promise<TaskComment | null>;
  fetchTaskDetail: (taskId: number) => Promise<TaskDetail | null>;
  uploadAttachment: (taskId: number, file: File) => Promise<TaskAttachment | null>;
  deleteAttachment: (attachmentId: number, taskId: number) => Promise<boolean>;
  refreshTasks: () => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isProjectCreateModalOpen, setIsProjectCreateModalOpen] = useState<boolean>(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  const [filters, setFilters] = useState<TaskFilterOptions>({});

  const resetFilters = () => setFilters({});

  // 1. Fetch initial projects, teams, and users
  const refreshProjects = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data);
        // Auto-select flagship UPSOW or first project if none selected
        setSelectedProject((prev) => {
          if (prev) {
            const found = data.data.find((p: Project) => p.id === prev.id);
            return found || data.data[0] || null;
          }
          const defaultProj = data.data.find((p: Project) => p.name.toUpperCase().includes('UPSOW')) || data.data[0];
          return defaultProj || null;
        });
      }
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  }, [token]);

  const loadTeamsAndUsers = useCallback(async () => {
    if (!token) return;
    try {
      const [teamsRes, usersRes] = await Promise.all([
        fetch('/api/teams', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const teamsData = await teamsRes.json();
      if (teamsData.success) {
        setTeams(teamsData.data);
      }

      const usersData = await usersRes.json();
      if (usersData.success) {
        setUsers(usersData.data);
      }
    } catch (err) {
      console.error('Failed to load teams/users', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshProjects();
      loadTeamsAndUsers();
    }
  }, [token, refreshProjects, loadTeamsAndUsers]);

  // 2. Fetch tasks whenever selected project changes
  const refreshTasks = useCallback(async () => {
    if (!token) return;
    setIsLoadingTasks(true);
    try {
      let url = '/api/tasks';
      const params = new URLSearchParams();

      if (filters.project_id === 'all') {
        // Query across all projects accessible to current user
      } else if (typeof filters.project_id === 'number') {
        params.append('project_id', String(filters.project_id));
      } else if (selectedProject) {
        params.append('project_id', String(selectedProject.id));
      }

      if (filters.team_id) params.append('team_id', String(filters.team_id));
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (typeof filters.assignee_id === 'number') {
        params.append('assignee_id', String(filters.assignee_id));
      }
      if (filters.due_date) params.append('due_date', filters.due_date);
      if (filters.from_date) params.append('from_date', filters.from_date);
      if (filters.to_date) params.append('to_date', filters.to_date);
      if (filters.search) params.append('search', filters.search);

      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        let resultTasks: Task[] = data.data;
        // Handle client-side 'unassigned' filter if needed
        if (filters.assignee_id === 'unassigned') {
          resultTasks = resultTasks.filter((t) => t.assignee_id === null);
        }
        setTasks(resultTasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [token, selectedProject, filters]);

  useEffect(() => {
    if (token) {
      refreshTasks();
    }
  }, [refreshTasks, token]);

  // 3. Socket.io Real-time connection & synchronization
  useEffect(() => {
    if (!token) return;

    const socket: Socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      if (selectedProject) {
        socket.emit('join:project', selectedProject.id);
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Handle real-time task creation
    socket.on('task:created', (payload: { task: Task; activity: any }) => {
      const newTask = payload.task;
      if (!selectedProject || newTask.project_id === selectedProject.id) {
        setTasks((prev) => {
          if (prev.some((t) => t.id === newTask.id)) return prev;
          return [newTask, ...prev];
        });
        refreshProjects(); // Update project progress stats
      }
    });

    // Handle real-time task property update
    socket.on('task:updated', (payload: { task: Task; changes: any; activity: any }) => {
      const updated = payload.task;
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    });

    // Handle real-time task status transition
    socket.on('task:status_changed', (payload: { task: Task; old_status: TaskStatus; new_status: TaskStatus; activity: any }) => {
      const updated = payload.task;
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      refreshProjects(); // Recalculate progress counters
    });

    // Handle real-time task assignment
    socket.on('task:assigned', (payload: { task: Task; assignee_id: number | null; activity: any }) => {
      const updated = payload.task;
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    });

    // Handle real-time task deletion
    socket.on('task:deleted', (payload: { task_id: number; project_id: number }) => {
      setTasks((prev) => prev.filter((t) => t.id !== payload.task_id));
      refreshProjects();
    });

    // Handle real-time subtask updates (count synchronization)
    socket.on('task:subtask_updated', (payload: { task_id: number; subtask: Subtask }) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== payload.task_id) return t;
          return {
            ...t,
            subtasks_completed: payload.subtask.is_completed
              ? (t.subtasks_completed || 0) + 1
              : Math.max(0, (t.subtasks_completed || 1) - 1)
          };
        })
      );
    });

    // Handle real-time comments added
    socket.on('task:comment_added', (payload: { task_id: number; comment: TaskComment }) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== payload.task_id) return t;
          return { ...t, comment_count: (t.comment_count || 0) + 1 };
        })
      );
    });

    return () => {
      if (selectedProject) {
        socket.emit('leave:project', selectedProject.id);
      }
      socket.disconnect();
    };
  }, [token, selectedProject, refreshProjects]);

  // 4. API Operations
  const createTask = async (payload: CreateTaskPayload): Promise<Task | null> => {
    if (!token) return null;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create task');
      }
      const created: Task = data.data;
      // Optimistically add to tasks list if matching current project
      setTasks((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [created, ...prev];
      });
      refreshProjects();
      return created;
    } catch (err) {
      console.error('Task creation error', err);
      throw err;
    }
  };

  const updateTask = async (taskId: number, payload: UpdateTaskPayload): Promise<Task | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update task');
      }
      const updated: Task = data.data;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      return updated;
    } catch (err) {
      console.error('Task update error', err);
      throw err;
    }
  };

  const updateTaskStatus = async (taskId: number, status: TaskStatus, position_order?: number): Promise<boolean> => {
    if (!token) return false;
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status, position_order: position_order ?? t.position_order } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, position_order })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Revert on error
        refreshTasks();
        throw new Error(data.error?.message || 'Failed to transition task status');
      }
      const updated: Task = data.data;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      refreshProjects();
      return true;
    } catch (err) {
      console.error('Status transition error', err);
      refreshTasks();
      return false;
    }
  };

  const assignTask = async (taskId: number, assigneeId: number | null): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ assignee_id: assigneeId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to reassign task');
      }
      const updated: Task = data.data;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      return true;
    } catch (err) {
      console.error('Task assignment error', err);
      return false;
    }
  };

  const deleteTask = async (taskId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to delete task');
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
      refreshProjects();
      return true;
    } catch (err) {
      console.error('Task deletion error', err);
      return false;
    }
  };

  const addSubtask = async (taskId: number, title: string): Promise<Subtask | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to add subtask');
      }
      // Update local task subtask count
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, subtask_count: (t.subtask_count || 0) + 1 } : t))
      );
      return data.data;
    } catch (err) {
      console.error('Subtask add error', err);
      return null;
    }
  };

  const toggleSubtask = async (subtaskId: number, isCompleted: boolean, taskId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_completed: isCompleted })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update subtask');
      }
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            subtasks_completed: isCompleted
              ? (t.subtasks_completed || 0) + 1
              : Math.max(0, (t.subtasks_completed || 1) - 1)
          };
        })
      );
      return true;
    } catch (err) {
      console.error('Subtask toggle error', err);
      return false;
    }
  };

  const deleteSubtask = async (subtaskId: number, taskId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/subtasks/${subtaskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to delete subtask');
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, subtask_count: Math.max(0, (t.subtask_count || 1) - 1) } : t))
      );
      return true;
    } catch (err) {
      console.error('Subtask delete error', err);
      return false;
    }
  };

  const addComment = async (taskId: number, content: string): Promise<TaskComment | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to post comment');
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, comment_count: (t.comment_count || 0) + 1 } : t))
      );
      return data.data;
    } catch (err) {
      console.error('Comment add error', err);
      return null;
    }
  };

  const fetchTaskDetail = async (taskId: number): Promise<TaskDetail | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to load task details');
      }
      return data.data as TaskDetail;
    } catch (err) {
      console.error('Fetch task detail error', err);
      return null;
    }
  };

  const createProject = async (payload: {
    name: string;
    description?: string;
    team_id?: number | null;
    manager_id?: number | null;
  }): Promise<Project | null> => {
    if (!token) return null;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create project');
      }
      const newProj: Project = data.data;
      await refreshProjects();
      setSelectedProject(newProj);
      return newProj;
    } catch (err) {
      console.error('Project creation error', err);
      throw err;
    }
  };

  const uploadAttachment = async (taskId: number, file: File): Promise<TaskAttachment | null> => {
    if (!token) return null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'TASK');
      formData.append('entity_id', taskId.toString());

      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to upload attachment');
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, attachment_count: (t.attachment_count || 0) + 1 } : t))
      );
      return data.data as TaskAttachment;
    } catch (err) {
      console.error('Attachment upload error', err);
      throw err;
    }
  };

  const deleteAttachment = async (attachmentId: number, taskId: number): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to delete attachment');
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, attachment_count: Math.max(0, (t.attachment_count || 1) - 1) } : t))
      );
      return true;
    } catch (err) {
      console.error('Attachment delete error', err);
      return false;
    }
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        projects,
        teams,
        users,
        selectedProject,
        selectedTaskId,
        isCreateModalOpen,
        isProjectCreateModalOpen,
        isLoadingTasks,
        filters,
        socketConnected,
        setSelectedProject,
        setSelectedTaskId,
        setIsCreateModalOpen,
        setIsProjectCreateModalOpen,
        setFilters,
        resetFilters,
        createProject,
        createTask,
        updateTask,
        updateTaskStatus,
        assignTask,
        deleteTask,
        addSubtask,
        toggleSubtask,
        deleteSubtask,
        addComment,
        fetchTaskDetail,
        uploadAttachment,
        deleteAttachment,
        refreshTasks,
        refreshProjects
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
}
