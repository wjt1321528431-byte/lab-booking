import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './sections/AuthPage';
import UserApp from './sections/UserApp';
import AdminApp from './sections/AdminApp';
import './App.css';

function AppRouter() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <AuthPage />;
  }

  if (currentUser.role === 'admin') {
    return <AdminApp />;
  }

  return <UserApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
