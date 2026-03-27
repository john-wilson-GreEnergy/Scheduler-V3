import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee } from '../types';

interface AuthContextType {
  user: any;
  employee: Employee | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isSiteManager: boolean;
  isSiteLead: boolean;
  isBessTech: boolean;
  isHR: boolean;
  loading: boolean;
  handleLogout: () => Promise<void>;
  handleLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// SIMULATION BYPASS: Force login as john.wilson@greenergyresources.com
const SIMULATED_EMAIL = 'john.wilson@greenergyresources.com';
const IS_SIMULATED = false; 

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(IS_SIMULATED ? {
    id: '00000000-0000-0000-0000-000000000000',
    email: SIMULATED_EMAIL,
    user_metadata: { full_name: 'Simulated User' }
  } : null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(IS_SIMULATED);
  const [isSuperAdmin, setIsSuperAdmin] = useState(IS_SIMULATED);
  const [isSiteManager, setIsSiteManager] = useState(false);
  const [isSiteLead, setIsSiteLead] = useState(false);
  const [isBessTech, setIsBessTech] = useState(false);
  const [isHR, setIsHR] = useState(false);
  const [loading, setLoading] = useState(!IS_SIMULATED);

  const checkAdminStatus = (role: string | null, email?: string) => {
    if (email?.toLowerCase() === 'john.wilson@greenergyresources.com') return true;
    return role === 'admin' || role === 'super_admin';
  };

  const checkRoleStatus = (role: string | null, email?: string) => {
    const isSuper = role === 'super_admin' || email?.toLowerCase() === 'john.wilson@greenergyresources.com';
    return {
      isSuperAdmin: isSuper,
      isSiteManager: role === 'site_manager',
      isSiteLead: role === 'site_lead',
      isBessTech: role === 'bess_tech',
      isHR: role === 'hr'
    };
  };

  const fetchEmployeeData = async (userId: string, authUser: any) => {
    try {
      console.log('Fetching employee data for userId:', userId);
      console.log('AuthUser email:', authUser.email);
      
      // 1. Fetch employee record
      let empRes = await supabase.from('employees').select('*').eq('auth_user_id', userId).maybeSingle();
      console.log('Employee query result (by auth_user_id):', empRes);
      
      if (!empRes.data && authUser.email) {
        console.log('No employee found by auth_user_id, trying email:', authUser.email);
        empRes = await supabase.from('employees').select('*').ilike('email', authUser.email).maybeSingle();
        console.log('Employee query result (by email):', empRes);
        if (empRes.data) {
          await supabase.from('employees').update({ auth_user_id: userId }).eq('id', empRes.data.id);
        }
      }

      // 2. Fetch user role from user_roles table
      let { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!roleData && authUser.email) {
        console.log('No role found by user_id, trying email:', authUser.email);
        const res = await supabase.from('user_roles').select('role').ilike('email', authUser.email).maybeSingle();
        roleData = res.data;
      }

      if (roleError) console.error('Error fetching user role:', roleError);
      let userRole = roleData?.role || null;

      // Hardcoded fallback for super admin email
      if (authUser.email?.toLowerCase() === 'john.wilson@greenergyresources.com') {
        console.log('Applying hardcoded super_admin role for:', authUser.email);
        userRole = 'super_admin';
      }

      if (empRes.data) {
        // 3. Fetch rotation config using employee UUID
        const rotRes = await supabase.from('rotation_configs').select('*').eq('employee_fk', empRes.data.id).maybeSingle();

        const employeeWithConfig = {
          ...empRes.data,
          rotation_config: rotRes.data || null
        };
        setEmployee(employeeWithConfig);
        setIsAdmin(checkAdminStatus(userRole, authUser.email));
        const roles = checkRoleStatus(userRole, authUser.email);
        setIsSuperAdmin(roles.isSuperAdmin);
        setIsSiteManager(roles.isSiteManager);
        setIsSiteLead(roles.isSiteLead);
        setIsBessTech(roles.isBessTech);
        setIsHR(roles.isHR);
        console.log('Roles set for employee:', { isAdmin: checkAdminStatus(userRole, authUser.email), isSuperAdmin: roles.isSuperAdmin });
      } else {
        console.log('No employee record found for user');
        if (IS_SIMULATED) {
          console.log('Simulation mode: Keeping default admin roles');
          setIsAdmin(true);
          setIsSuperAdmin(true);
        } else {
          setIsAdmin(checkAdminStatus(userRole, authUser.email));
          const roles = checkRoleStatus(userRole, authUser.email);
          setIsSuperAdmin(roles.isSuperAdmin);
          setIsSiteManager(roles.isSiteManager);
          setIsSiteLead(roles.isSiteLead);
          setIsBessTech(roles.isBessTech);
          setIsHR(roles.isHR);
          console.log('Roles set for non-employee user:', { isAdmin: checkAdminStatus(userRole, authUser.email), isSuperAdmin: roles.isSuperAdmin });
        }
      }
    } catch (err) {
      console.error('Error fetching employee data:', err);
      if (IS_SIMULATED) {
        console.log('Simulation mode: Error occurred, but keeping admin roles for access');
        setIsAdmin(true);
        setIsSuperAdmin(true);
      } else {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsSiteManager(false);
        setIsSiteLead(false);
        setIsBessTech(false);
        setIsHR(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('AuthProvider: Initializing auth state...');
    
    const initSession = async () => {
      if (IS_SIMULATED) {
        console.log('AuthProvider: SIMULATION MODE ACTIVE - Fetching data for:', SIMULATED_EMAIL);
        await fetchEmployeeData(user.id, user);
        return;
      }

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
        
        // Only fetch employee data if we have a session
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
      if (IS_SIMULATED) return; // Ignore auth changes in simulation mode
      console.log('AuthProvider: Auth state changed:', _event, session ? 'User found' : 'No user');
      setUser(session?.user ?? null);
      
      // Only fetch if session exists and is different from current state (implicitly handled by fetchEmployeeData)
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
    if (IS_SIMULATED) {
      console.log('AuthProvider: Simulation login triggered');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error);
  };

  const handleLogout = async () => {
    if (IS_SIMULATED) {
      console.log('AuthProvider: Simulation logout triggered (ignored)');
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setEmployee(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setIsSiteManager(false);
    setIsSiteLead(false);
    setIsBessTech(false);
    setIsHR(false);
  };

  const value = useMemo(() => ({
    user, 
    employee, 
    isAdmin, 
    isSuperAdmin,
    isSiteManager, 
    isSiteLead, 
    isBessTech, 
    isHR,
    loading, 
    handleLogout, 
    handleLogin 
  }), [user, employee, isAdmin, isSuperAdmin, isSiteManager, isSiteLead, isBessTech, isHR, loading]);

  return (
    <AuthContext.Provider value={value}>
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
