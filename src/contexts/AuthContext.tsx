import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Employee } from '../types';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

console.log('⚡️ AUTH_CONTEXT_V11_LOADED');

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
  isLoggingIn: boolean;
  handleLogout: () => Promise<void>;
  handleLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSiteManager, setIsSiteManager] = useState(false);
  const [isSiteLead, setIsSiteLead] = useState(false);
  const [isBessTech, setIsBessTech] = useState(false);
  const [isHR, setIsHR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isInitializing = React.useRef(false);

  const checkAdminStatus = (role: string | null) => {
    return role === 'admin' || role === 'super_admin';
  };

  const checkRoleStatus = (role: string | null) => {
    return {
      isSuperAdmin: role === 'super_admin',
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
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) console.error('Error fetching user role:', roleError);
      const userRole = roleData?.role || null;

      if (empRes.data) {
        // 3. Fetch rotation config using employee UUID
        const rotRes = await supabase.from('rotation_configs').select('*').eq('employee_fk', empRes.data.id).maybeSingle();

        const employeeWithConfig = {
          ...empRes.data,
          rotation_config: rotRes.data || null
        };
        setEmployee(employeeWithConfig);
        setIsAdmin(checkAdminStatus(userRole));
        const roles = checkRoleStatus(userRole);
        setIsSuperAdmin(roles.isSuperAdmin);
        setIsSiteManager(roles.isSiteManager);
        setIsSiteLead(roles.isSiteLead);
        setIsBessTech(roles.isBessTech);
        setIsHR(roles.isHR);
      } else {
        setIsAdmin(checkAdminStatus(userRole));
        const roles = checkRoleStatus(userRole);
        setIsSuperAdmin(roles.isSuperAdmin);
        setIsSiteManager(roles.isSiteManager);
        setIsSiteLead(roles.isSiteLead);
        setIsBessTech(roles.isBessTech);
        setIsHR(roles.isHR);
      }
    } catch (err) {
      console.error('Error fetching employee data:', err);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsSiteManager(false);
      setIsSiteLead(false);
      setIsBessTech(false);
      setIsHR(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('⚡️ AuthProvider: useEffect triggered');
    if (isInitializing.current) {
      console.log('⚡️ AuthProvider: Already initializing, skipping.');
      return;
    }
    isInitializing.current = true;

    // Reusable deep link processor
    const handleDeepLink = async (url: string) => {
      console.log('⚡️ handleDeepLink called with URL:', url);
      if (!url) return;

      if (url.includes('access_token')) {
        console.log('⚡️ Auth tokens detected in URL, parsing...');
        setIsLoggingIn(true);
        
        try {
          // Extract tokens from the fragment (#)
          const hash = url.split('#')[1];
          if (!hash) {
            console.error('⚡️ No hash found in deep link URL');
            return;
          }

          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            console.log('⚡️ Manually setting session from tokens...');
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            
            if (error) {
              console.error('⚡️ Supabase setSession error:', error);
            } else if (data.session) {
              console.log('⚡️ Session successfully set for:', data.session.user.email);
              setUser(data.session.user);
              await fetchEmployeeData(data.session.user.id, data.session.user);
            }
          } else {
            console.warn('⚡️ access_token or refresh_token missing in URL hash');
          }
        } catch (err) {
          console.error('⚡️ Failed to parse deep link URL:', err);
        } finally {
          setIsLoggingIn(false);
        }
      } else {
        console.log('⚡️ URL does not contain auth tokens, ignoring.');
      }
    };

    // Handle deep links and app state changes
    const setupAppListeners = async () => {
      try {
        const platform = Capacitor.getPlatform();
        const isNative = Capacitor.isNativePlatform();
        console.log(`⚡️ setupAppListeners: Platform=${platform}, Native=${isNative}`);

        if (!App) {
          console.error('⚡️ Capacitor App plugin is NOT available!');
          return;
        }

        if (isNative) {
          console.log('⚡️ Native platform: Setting up listeners...');
          
          // Listen for app state changes (resume/background)
          App.addListener('appStateChange', ({ isActive }) => {
            console.log('⚡️ App state changed. Is active:', isActive);
            if (isActive) {
              // Reset logging state after a delay if we returned from browser
              setTimeout(() => setIsLoggingIn(false), 2000);
            }
          });

          // Listen for deep links while app is running
          App.addListener('appUrlOpen', (event: any) => {
            console.log('⚡️ Deep Link Received (appUrlOpen):', event.url);
            handleDeepLink(event.url);
          });

          // Check for launch URL (app was closed and opened via deep link)
          console.log('⚡️ Checking for Launch URL...');
          const launchUrl = await App.getLaunchUrl();
          console.log('⚡️ Launch URL Result:', launchUrl);
          if (launchUrl?.url) {
            handleDeepLink(launchUrl.url);
          }
        } else {
          console.log('⚡️ Web platform: Skipping native listeners.');
        }
      } catch (err) {
        console.error('⚡️ Error in setupAppListeners:', err);
      }
    };

    setupAppListeners();
    
    const initSession = async () => {
      console.log('⚡️ initSession started');
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
    if (!loading && user) return; // Already logged in
    
    const isNative = Capacitor.isNativePlatform();
    // Use a more specific redirect for native
    const redirectTo = isNative 
      ? 'com.greenergyresources.portal://login' 
      : window.location.origin;

    console.log('AuthProvider: Starting login with redirectTo:', redirectTo);
    setLoading(true);
    setIsLoggingIn(true);

    const { error } = await supabase.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    
    if (error) {
      console.error('Login error:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
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
    isLoggingIn,
    handleLogout, 
    handleLogin 
  }), [user, employee, isAdmin, isSuperAdmin, isSiteManager, isSiteLead, isBessTech, isHR, loading, isLoggingIn]);

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
