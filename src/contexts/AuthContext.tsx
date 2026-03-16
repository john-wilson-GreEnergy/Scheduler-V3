import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Employee } from '../types';

interface AuthContextType {
  user: any;
  employee: Employee | null;
  isAdmin: boolean;
  isSiteManager: boolean;
  isSiteLead: boolean;
  isBessTech: boolean;
  loading: boolean;
  handleLogout: () => Promise<void>;
  handleLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSiteManager, setIsSiteManager] = useState(false);
  const [isSiteLead, setIsSiteLead] = useState(false);
  const [isBessTech, setIsBessTech] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = (authUser: any, employeeData: Employee | null) => {
    if (!authUser) return false;
    if (employeeData?.role === 'admin') return true;
    const email = authUser.email || '';
    if (email.endsWith('@greenergyresources.com')) return true;
    return false;
  };

  const checkRoleStatus = (employeeData: Employee | null) => {
    if (!employeeData) return { isSiteManager: false, isSiteLead: false, isBessTech: false };
    
    return {
      isSiteManager: employeeData.role === 'site_manager',
      isSiteLead: employeeData.role === 'site_lead',
      isBessTech: employeeData.role === 'bess_tech'
    };
  };

  const fetchEmployeeData = async (userId: string, authUser: any) => {
    try {
      let empRes = await supabase.from('employees').select('*').eq('auth_user_id', userId).maybeSingle();
      
      if (!empRes.data && authUser.email) {
        empRes = await supabase.from('employees').select('*').ilike('email', authUser.email).maybeSingle();
        if (empRes.data) {
          await supabase.from('employees').update({ auth_user_id: userId }).eq('id', empRes.data.id);
        }
      }

      const rotRes = await supabase.from('rotation_configs').select('*').eq('employee_fk', userId).maybeSingle();

      if (empRes.data) {
        const employeeWithConfig = {
          ...empRes.data,
          rotation_config: rotRes.data || null
        };
        setEmployee(employeeWithConfig);
        setIsAdmin(checkAdminStatus(authUser, employeeWithConfig));
        const roles = checkRoleStatus(employeeWithConfig);
        setIsSiteManager(roles.isSiteManager);
        setIsSiteLead(roles.isSiteLead);
        setIsBessTech(roles.isBessTech);
      } else {
        setIsAdmin(checkAdminStatus(authUser, null));
        setIsSiteManager(false);
        setIsSiteLead(false);
        setIsBessTech(false);
      }
    } catch (err) {
      console.error('Error fetching employee data:', err);
      setIsAdmin(checkAdminStatus(authUser, null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('AuthProvider: Initializing auth state...');
    
    const initSession = async () => {
      if (!supabase) {
        console.error('AuthProvider: Supabase client is not initialized!');
        setLoading(false);
        return;
      }
      try {
        console.log('AuthProvider: Fetching session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AuthProvider: Session fetch error:', error);
          setLoading(false);
          return;
        }

        console.log('AuthProvider: Session result:', session ? 'User found' : 'No user');
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchEmployeeData(session.user.id, session.user);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('AuthProvider: Unexpected error during init:', err);
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('AuthProvider: Auth state changed:', _event, session ? 'User found' : 'No user');
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchEmployeeData(session.user.id, session.user);
      } else {
        setEmployee(null);
        setIsAdmin(false);
        setIsSiteManager(false);
        setLoading(false);
      }
    });

    // Safety timeout: Ensure loading is disabled after 5 seconds no matter what
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('AuthProvider: Loading timed out after 5s. Forcing loading to false.');
          return false;
        }
        return prev;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEmployee(null);
    setIsAdmin(false);
    setIsSiteManager(false);
    setIsSiteLead(false);
    setIsBessTech(false);
  };

  return (
    <AuthContext.Provider value={{ user, employee, isAdmin, isSiteManager, isSiteLead, isBessTech, loading, handleLogout, handleLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
