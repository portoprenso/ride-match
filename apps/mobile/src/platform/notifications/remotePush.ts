import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ExpoPushTokenSchema } from '@ride-match/contracts';
import type { AppStateSource } from '../appState';

/**
 * Real Expo token boundary, active only with a configured public EAS project ID and granted
 * permission. Never prompts or invents a token. Native token rotation/foreground invalidates
 * the cache and re-registers; raw APNs/FCM tokens and OS failures never leave this boundary.
 */
export function createRemotePush(appState:AppStateSource,module:Pick<typeof Notifications,'getExpoPushTokenAsync'|'addPushTokenListener'>=Notifications,
  projectId:string|undefined=Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId as string|undefined) {
  let cached:string|null=null;
  return {
    async getToken():Promise<string|null>{
      if(!projectId || Platform.OS==='web')return null;
      if(cached)return cached;
      try{const result=ExpoPushTokenSchema.safeParse((await module.getExpoPushTokenAsync({projectId})).data);cached=result.success?result.data:null;return cached;}
      catch{return null;}
    },
    watch(listener:()=>void):()=>void {
      if(!projectId)return()=>undefined;
      const changed=()=>{cached=null;listener();};
      const token=module.addPushTokenListener(changed);
      const state=appState.addEventListener('change',(next)=>{if(next==='active')changed();});
      return()=>{token.remove();state.remove();cached=null;};
    },
  };
}
