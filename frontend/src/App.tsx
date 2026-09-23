import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { TaskProvider, useTasks } from './context/TaskContext.js';
import { NotificationProvider } from './context/NotificationContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { SignupPage } from './pages/SignupPage.js';
import { Header } from './components/layout/Header.js';
import { Sidebar, ActiveTab } from './components/layout/Sidebar.js';
import { KanbanBoard } from './pages/KanbanBoard.js';
import { Dashboard } from './pages/Dashboard.js';
import { CalendarView } from './pages/CalendarView.js';
import { MyWork } from './pages/MyWork.js';
import { DashboardShell } from './pages/DashboardShell.js';
import { ProjectCreateModal } from './components/projects/ProjectCreateModal.js';
import { NotificationToast } from './components/notifications/NotificationToast.js';

function AuthenticatedWorkspace() {
  const { setSelectedTaskId, isProjectCreateModalOpen, setIsProjectCreateModalOpen } = useTasks();
  const [activeTab, setActiveTab] = useState<ActiveTab>('kanban');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header onOpenTask={(id) => setSelectedTaskId(id)} />
      <NotificationToast onNotificationClick={(id) => setSelectedTaskId(id)} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          {activeTab === 'dashboard' && (
            <Dashboard onNavigateToKanban={() => setActiveTab('kanban')} />
          )}
          {activeTab === 'kanban' && <KanbanBoard />}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'mywork' && <MyWork />}
          {activeTab === 'rbac' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <DashboardShell />
            </div>
          )}
        </main>
      </div>

      {/* Global Modals */}
      <ProjectCreateModal
        isOpen={isProjectCreateModalOpen}
        onClose={() => setIsProjectCreateModalOpen(false)}
      />
    </div>
  );
}

function MainApp() {
  const { user, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(99, 102, 241, 0.2)',
            borderTopColor: 'var(--brand-secondary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Verifying Upsow Session...</p>
      </div>
    );
  }

  if (!user) {
    if (authView === 'signup') {
      return <SignupPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToSignup={() => setAuthView('signup')} />;
  }

  return (
    <NotificationProvider>
      <TaskProvider>
        <AuthenticatedWorkspace />
      </TaskProvider>
    </NotificationProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
