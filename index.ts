import { EventEmitter } from 'events';

import * as config from '../config/config.json';
import { initAll } from '../lib/modules';
import EventHandler from './Eventhandler/Eventhandler';

new EventHandler(new EventEmitter(), config.requestTimeout);

EventHandler.bind("Kernel:IsPresent", ():Boolean => { 
    return true;
})
console.log("Present event bound");
EventHandler.bind("Kernel:Broadcast",(data)=>{
    console.log("Broadcast: "+data);
});
EventHandler.bind("Kernel:Config:RequestTimeout",():number=>{
    return config.requestTimeout
});

EventHandler.emit("Kernel:Broadcast", "Test");
EventHandler.request<Boolean>("Kernel:IsPresent").then((data:Boolean)=>console.log(data));

initAll(EventHandler.emitter);
process.stdin.resume(); //TODO Remove later

