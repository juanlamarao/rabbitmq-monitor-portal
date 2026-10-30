import { createContext, useContext } from 'react';
import { PortalSession } from './auth';
export const AuthContext = createContext<PortalSession>({email:'',name:'',local:false,is_admin:false,edit_cluster_ids:[],csrf_token:''});
export const useAuth = () => useContext(AuthContext);
