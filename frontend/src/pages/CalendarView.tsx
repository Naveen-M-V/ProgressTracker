import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Plus,
  Clock,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTasks } from '../context/TaskContext.js';
import { Task, TaskStatus, ItemType } from '../types/task.js';
import { PriorityBadge } from '../components/common/PriorityBadge.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { UserAvatar } from '../components/common/UserAvatar.js';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal.js';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal.js';

type CalendarViewMode = 'month' | 'week' | 'day';

export function CalendarView() {
  const { user } = useAuth();
  const {
    tasks,
    projects,
    teams,
    users,
    selectedTaskId,
    setSelectedTaskId,
    isCreateModalOpen,
    setIsCreateModalOpen
  } = useTasks();

  const availableTeams = useMemo(() => {
    if (!user || user.role === 'ADMIN' || user.role === 'PROJECT_MANAGER') {
      return teams;
    }
    return teams.filter((t) => t.is_member);
  }, [teams, user]);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Multi-Faceted Filters (PRD Section 5)
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterItemType, setFilterItemType] = useState<string>('all');

  // Pre-filled date and type for modal when creating from calendar
  const [createDate, setCreateDate] = useState<string>('');
  const [createItemType, setCreateItemType] = useState<ItemType>('TASK');

  const resetFilters = () => {
    setFilterProjectId('all');
    setFilterTeamId('all');
    setFilterAssigneeId('all');
    setFilterStatus('all');
    setFilterItemType('all');
  };

  const hasActiveFilters =
    filterProjectId !== 'all' ||
    filterTeamId !== 'all' ||
    filterAssigneeId !== 'all' ||
    filterStatus !== 'all' ||
    filterItemType !== 'all';

  // Apply simultaneous multi-faceted filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((t: Task) => {
      if (filterProjectId !== 'all' && t.project_id !== Number(filterProjectId)) {
        return false;
      }
      if (filterTeamId !== 'all' && t.team_id !== Number(filterTeamId)) {
        return false;
      }
      if (filterAssigneeId !== 'all') {
        if (filterAssigneeId === 'unassigned') {
          if (t.assignee_id !== null) return false;
        } else if (t.assignee_id !== Number(filterAssigneeId)) {
          return false;
        }
      }
      if (filterStatus !== 'all' && t.status !== filterStatus) {
        return false;
      }
      if (filterItemType !== 'all') {
        const itemType = t.item_type || 'TASK';
        if (itemType !== filterItemType) return false;
      }
      return true;
    });
  }, [tasks, filterProjectId, filterTeamId, filterAssigneeId, filterStatus, filterItemType]);

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
      else if (viewMode === 'week') d.setDate(d.getDate() - 7);
      else d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
      else if (viewMode === 'week') d.setDate(d.getDate() + 7);
      else d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleToday = () => setCurrentDate(new Date());

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'TODO':
        return '#64748b';
      case 'IN_PROGRESS':
        return '#3b82f6';
      case 'REVIEW':
        return '#f59e0b';
      case 'BLOCKED':
        return '#ef4444';
      case 'COMPLETED':
        return '#10b981';
      default:
        return '#64748b';
    }
  };

  // Helper to check if task falls on a specific date (YYYY-MM-DD)
  const isTaskOnDate = (task: Task, dateStr: string) => {
    const taskDue = task.due_date ? task.due_date.split('T')[0] : null;
    const taskStart = task.start_date ? task.start_date.split('T')[0] : null;

    if (task.item_type === 'EVENT') {
      return taskDue === dateStr;
    }

    if (taskDue && taskStart) {
      return dateStr >= taskStart && dateStr <= taskDue;
    }
    if (taskDue) return taskDue === dateStr;
    if (taskStart) return taskStart === dateStr;
    return false;
  };

  // Format header title
  const formattedHeaderTitle = useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [currentDate, viewMode]);

  // Generate Month Grid Days
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({
        date: d,
        dateStr: d.toISOString().split('T')[0],
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`,
        isCurrentMonth: true
      });
    }

    // Next month padding to fill complete grid of 35 or 42
    const totalCells = days.length > 35 ? 42 : 35;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`,
        isCurrentMonth: false
      });
    }

    return days;
  }, [currentDate]);

  // Generate Week Days (Sun - Sat)
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const days: { date: Date; dateStr: string; dayName: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
      });
    }
    return days;
  }, [currentDate]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const handleDayClick = (dateStr: string, defaultType: ItemType = 'TASK') => {
    setCreateDate(dateStr);
    setCreateItemType(defaultType);
    setIsCreateModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* Top Toolbar: Filters & Controls */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(17, 24, 39, 0.4)',
          backdropFilter: 'var(--backdrop-blur)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        {/* Navigation & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handlePrev}
              className="btn-secondary"
              style={{ padding: '6px 8px' }}
              title="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="btn-secondary"
              style={{ padding: '6px 8px' }}
              title="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {formattedHeaderTitle}
          </h2>
        </div>

        {/* View Switcher (Month, Week, Day) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: '2px',
              display: 'flex'
            }}
          >
            {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: viewMode === mode ? 'var(--brand-primary)' : 'transparent',
                  color: viewMode === mode ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: viewMode === mode ? 700 : 500,
                  fontSize: '0.8rem',
                  textTransform: 'capitalize',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                setCreateDate(todayStr);
                setCreateItemType('TASK');
                setIsCreateModalOpen(true);
              }}
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.825rem' }}
            >
              <Plus size={15} />
              <span>New Task</span>
            </button>

            <button
              onClick={() => {
                setCreateDate(todayStr);
                setCreateItemType('EVENT');
                setIsCreateModalOpen(true);
              }}
              className="btn-primary"
              style={{
                padding: '6px 14px',
                fontSize: '0.825rem',
                backgroundColor: '#9333ea',
                borderColor: '#a855f7'
              }}
            >
              <Calendar size={15} />
              <span>New Event</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Faceted Filter Bar (PRD Section 5) */}
      <div
        style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(11, 15, 25, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Filter By:
        </span>

        {/* 1. Item Type Filter: All vs Tasks vs Events */}
        <select
          value={filterItemType}
          onChange={(e) => setFilterItemType(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '5px 10px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          <option value="all">All Types (Tasks & Events)</option>
          <option value="TASK">Tasks Only</option>
          <option value="EVENT">Events Only</option>
        </select>

        {/* 2. Project Filter */}
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '5px 10px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* 3. Team Filter */}
        <select
          value={filterTeamId}
          onChange={(e) => setFilterTeamId(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '5px 10px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">{user?.role === 'ADMIN' ? 'All Teams' : 'All My Teams'}</option>
          {availableTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} Team
            </option>
          ))}
        </select>

        {/* 4. Person / Assignee Filter */}
        <select
          value={filterAssigneeId}
          onChange={(e) => setFilterAssigneeId(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '5px 10px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/* 5. Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '5px 10px',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        >
          <option value="all">All Statuses</option>
          <option value="TODO">To Do / Scheduled</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="REVIEW">In Review</option>
          <option value="BLOCKED">Blocked</option>
          <option value="COMPLETED">Completed</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="btn-secondary"
            style={{ padding: '5px 8px', fontSize: '0.75rem' }}
            title="Reset calendar filters"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}

        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing <strong>{filteredTasks.length}</strong> {filteredTasks.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Main Calendar Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* VIEW 1: MONTH VIEW */}
        {viewMode === 'month' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '620px' }}>
            {/* Weekday Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(23, 32, 54, 0.4)',
                textAlign: 'center',
                padding: '8px 0',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Month Day Cells */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                flex: 1,
                backgroundColor: 'var(--border-subtle)',
                gap: '1px'
              }}
            >
              {monthDays.map((day, idx) => {
                const dayTasks = filteredTasks.filter((t: Task) => isTaskOnDate(t, day.dateStr));
                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    onClick={() => handleDayClick(day.dateStr)}
                    style={{
                      backgroundColor: day.isCurrentMonth ? 'var(--bg-secondary)' : 'rgba(11, 15, 25, 0.8)',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      minHeight: '90px',
                      cursor: 'pointer',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={(e) => {
                      if (day.isCurrentMonth) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (day.isCurrentMonth) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    }}
                  >
                    {/* Day Number Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: isToday ? 800 : 600,
                          color: isToday
                            ? '#ffffff'
                            : day.isCurrentMonth
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                          backgroundColor: isToday ? 'var(--brand-primary)' : 'transparent',
                          width: isToday ? '22px' : 'auto',
                          height: isToday ? '22px' : 'auto',
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {day.date.getDate()}
                      </span>

                      {dayTasks.length > 0 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {dayTasks.length} task{dayTasks.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Task Strips in Day Cell */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                      {dayTasks.slice(0, 3).map((task: Task) => {
                        const isEvent = task.item_type === 'EVENT';
                        return (
                          <div
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskId(task.id);
                            }}
                            style={{
                              padding: '3px 6px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isEvent ? 'rgba(147, 51, 234, 0.25)' : `${getStatusColor(task.status)}22`,
                              borderLeft: isEvent ? '3px solid #c084fc' : `3px solid ${getStatusColor(task.status)}`,
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              color: isEvent ? '#f3e8ff' : 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'transform var(--transition-fast)'
                            }}
                            title={isEvent ? `Event: ${task.title}` : `${task.title} (${task.status})`}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                          >
                            {isEvent && <Calendar size={11} color="#c084fc" style={{ flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</span>
                          </div>
                        );
                      })}
                      {dayTasks.length > 3 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--brand-secondary)', fontWeight: 600, paddingLeft: '4px' }}>
                          +{dayTasks.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: WEEK VIEW */}
        {viewMode === 'week' && (
          <div style={{ display: 'flex', flex: 1, minHeight: '600px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1, gap: '1px', backgroundColor: 'var(--border-subtle)' }}>
              {weekDays.map((day, idx) => {
                const dayTasks = filteredTasks.filter((t: Task) => isTaskOnDate(t, day.dateStr));
                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px 8px',
                      gap: '8px'
                    }}
                  >
                    {/* Week Column Header */}
                    <div
                      style={{
                        textAlign: 'center',
                        paddingBottom: '8px',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: isToday ? 'var(--brand-secondary)' : 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}
                    >
                      {day.dayName}
                    </div>

                    {/* Column Tasks */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                      {dayTasks.length === 0 ? (
                        <div
                          onClick={() => handleDayClick(day.dateStr)}
                          style={{
                            flex: 1,
                            minHeight: '80px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px dashed rgba(255, 255, 255, 0.05)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-muted)',
                            fontSize: '0.725rem',
                            cursor: 'pointer'
                          }}
                        >
                          + Add
                        </div>
                      ) : (
                        dayTasks.map((task: Task) => {
                          const isEvent = task.item_type === 'EVENT';
                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTaskId(task.id)}
                              className="card-glass"
                              style={{
                                padding: '10px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                borderLeft: isEvent ? '3px solid #c084fc' : `3px solid ${getStatusColor(task.status)}`,
                                backgroundColor: isEvent ? 'rgba(88, 28, 135, 0.15)' : undefined
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {isEvent ? (
                                  <span
                                    style={{
                                      fontSize: '0.65rem',
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                      padding: '2px 7px',
                                      borderRadius: '999px',
                                      backgroundColor: 'rgba(168, 85, 247, 0.25)',
                                      color: '#d8b4fe',
                                      border: '1px solid rgba(168, 85, 247, 0.4)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    <Calendar size={10} /> Event
                                  </span>
                                ) : (
                                  <PriorityBadge priority={task.priority} size="sm" />
                                )}
                              </div>
                              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {task.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                <span>#{task.id}</span>
                                {task.assignee_name && <UserAvatar name={task.assignee_name} size={18} />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: DAY AGENDA VIEW */}
        {viewMode === 'day' && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Daily Agenda
                </h3>
                <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  Items scheduled or due on {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    const dStr = currentDate.toISOString().split('T')[0];
                    setCreateDate(dStr);
                    setCreateItemType('TASK');
                    setIsCreateModalOpen(true);
                  }}
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                >
                  <Plus size={14} /> Schedule Task
                </button>
                <button
                  onClick={() => {
                    const dStr = currentDate.toISOString().split('T')[0];
                    setCreateDate(dStr);
                    setCreateItemType('EVENT');
                    setIsCreateModalOpen(true);
                  }}
                  className="btn-primary"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    backgroundColor: '#9333ea',
                    borderColor: '#a855f7'
                  }}
                >
                  <Calendar size={14} /> Add Event
                </button>
              </div>
            </div>

            {/* List of Tasks for this Day */}
            {(() => {
              const currentDayStr = currentDate.toISOString().split('T')[0];
              const dayTasks = filteredTasks.filter((t: Task) => isTaskOnDate(t, currentDayStr));

              if (dayTasks.length === 0) {
                return (
                  <div
                    className="card-glass"
                    style={{
                      padding: '48px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <Clock size={32} color="var(--text-muted)" />
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>No tasks or events scheduled for this date.</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dayTasks.map((t: Task) => {
                    const isEvent = t.item_type === 'EVENT';
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTaskId(t.id)}
                        className="card-glass"
                        style={{
                          padding: '14px 18px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          borderLeft: isEvent ? '4px solid #c084fc' : `4px solid ${getStatusColor(t.status)}`,
                          backgroundColor: isEvent ? 'rgba(88, 28, 135, 0.15)' : undefined
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            {isEvent ? (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: 'rgba(168, 85, 247, 0.25)',
                                  color: '#d8b4fe',
                                  border: '1px solid rgba(168, 85, 247, 0.4)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Calendar size={11} /> Event
                              </span>
                            ) : (
                              <PriorityBadge priority={t.priority} size="sm" />
                            )}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Project: {t.project_name || `#${t.project_id}`}
                            </span>
                          </div>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                            {t.title}
                          </h4>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {t.assignee_name ? (
                            <UserAvatar name={t.assignee_name} avatarUrl={t.assignee_avatar} size={24} showName />
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Unassigned
                            </span>
                          )}
                          <StatusBadge status={t.status} size="sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modals */}
      <TaskCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateDate('');
          setCreateItemType('TASK');
        }}
        initialStatus="TODO"
        initialDueDate={createDate}
        initialItemType={createItemType}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
