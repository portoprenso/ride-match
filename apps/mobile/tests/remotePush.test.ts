import { createRemotePush } from '../src/platform/notifications/remotePush';

jest.mock('expo-notifications',()=>({getExpoPushTokenAsync:jest.fn(),addPushTokenListener:jest.fn()}));

describe('real remote-push token boundary',()=>{
  it('does nothing without a configured EAS project and never invents a token',async()=>{
    const module={getExpoPushTokenAsync:jest.fn(),addPushTokenListener:jest.fn()};
    const appState={currentState:'active',addEventListener:jest.fn()};
    const source=createRemotePush(appState,module,undefined);
    expect(await source.getToken()).toBeNull();const stop=source.watch(jest.fn());stop();
    expect(module.getExpoPushTokenAsync).not.toHaveBeenCalled();expect(module.addPushTokenListener).not.toHaveBeenCalled();expect(appState.addEventListener).not.toHaveBeenCalled();
  });
  it('refreshes a real Expo token after rotation/foreground and releases native listeners',async()=>{
    let rotated:()=>void=()=>undefined;let foreground:(state:string)=>void=()=>undefined;
    const removeToken=jest.fn();const removeState=jest.fn();
    const module={getExpoPushTokenAsync:jest.fn().mockResolvedValue({data:'ExpoPushToken[synthetic-real-provider-test]'}),addPushTokenListener:jest.fn((listener)=>{rotated=listener;return {remove:removeToken};})};
    const appState={currentState:'active',addEventListener:jest.fn((_type:string,listener:(state:string)=>void)=>{foreground=listener;return {remove:removeState};})};
    const source=createRemotePush(appState,module,'00000000-0000-4000-8000-000000000001');const changed=jest.fn();const stop=source.watch(changed);
    expect(await source.getToken()).toBe('ExpoPushToken[synthetic-real-provider-test]');await source.getToken();expect(module.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    rotated();await source.getToken();foreground('active');await source.getToken();expect(module.getExpoPushTokenAsync).toHaveBeenCalledTimes(3);
    expect(changed).toHaveBeenCalledTimes(2);stop();expect(removeToken).toHaveBeenCalledTimes(1);expect(removeState).toHaveBeenCalledTimes(1);
  });
});
