import * as fs from 'fs';
import * as net from 'net';
import peer from 'noise-peer';

import RequestHandler from './requester';
import Delegate from './Utils/Delegate/Delegate';
import { DetailedStatus } from './Utils/enums/DetailedStatus';
import { Eventdata } from './Utils/interfaces/Eventdata';
import { SubscriptionChangeData } from './Utils/interfaces/SubscriptionChangeData';

//Open server for Requests
const server = net.createServer({}, (rawStream) => {
    const secStream = peer(rawStream, false);
    let response = null;

    secStream.on('data', async (body) => {
        console.log("Data1")
        const data: Eventdata = JSON.parse(body);
        console.log(data);
        body = "";
        switch (data.eventname) { //Evaluate eventname
            case "kernel/subscribe":
                response = subscribe(data);
                break;
            case "kernel/unsubscribe":
                response = unsubscribe(data);
                break;
            case "kernel/init":
                response = init(data, secStream);
                break;
            case "kernel/dispose":
                response = disposeModule(data);
                break;
            case "kernel/log":
                response = await log(data);
                break;
            default: //Handle all custom events
                response = await handle(data.eventname, data);
                break;
        }
        
        var container = {
            id: data.id,
            eventname: data.eventname,
            payload: response
        }
        
        console.log(JSON.stringify(container));
        secStream.write(JSON.stringify(container));
    });
}).listen(8000);

//Shutdown logic
[`beforeExit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, async (code) => {
        const proms = [];
        for (const [port, handler] of handlers) {
            proms.push(handler.request("control/shutdown", "")); //Command all modules to shut down
            console.log("Disposed port " + port);
        }
        server.close(); //Close Server for Requests
        handlers.clear(); //Remove all module handlers
        bindings.clear(); //Clear all event bindings

        await Promise.all(proms); //Wait for disposals to finish
        process.exit(code); //Kill the process
    });
})

const handlers = new Map<string, RequestHandler>(); //All handlers for modules
const bindings = new Map<string, Delegate<(...args: any[]) => unknown>>(); //All event bindings
//let middlewares = new Map<string, Delegate<(...args: any) => any>>(); currently unused

/**
 * Subscription logic
 * @param body payload from module
 * @param res response for module
 */
function subscribe(body: Eventdata) {
    const eventdata: SubscriptionChangeData = <SubscriptionChangeData>body.payload;
    if (!bindings.has(eventdata.eventname)) //Create new Delegate if there is none
        bindings.set(eventdata.eventname, new Delegate())
    const handler = handlers.get(body.modulename); //Get the Delegate
    const result = bindings.get(eventdata.eventname).bind(handler.request, handler); //Bind new handler to event
    if (result) { //Log varying success
        console.log("Module " + body.modulename + " subscribed to " + eventdata.eventname)
    } else {
        console.log("Module " + body.modulename + " tried to subscribe to " + eventdata.eventname + " but was already subscribed.")
    }

    return [{
        id: body.id,
        statusCode: 200,
        body: {}
    }]
}

/**
 * Unsubscribe Logic
 * @param body payload from module
 * @param res response for module
 */
function unsubscribe(body: Eventdata) {
    const eventdata: SubscriptionChangeData = <SubscriptionChangeData>body.payload;
    const handler = handlers.get(body.modulename);

    let result = false;
    if (bindings.has(eventdata.eventname)) //Remove handler binding
        result = bindings.get(eventdata.eventname).unbind(handler.request, handler);

    //Log varying success
    if (result) {
        console.log("Module " + body.modulename + " unsubscribed from " + eventdata.eventname)
    } else {
        console.log("Module " + body.modulename + " tried to unsubscribe from " + eventdata.eventname + " but wasn't subscribed!")
    }

    return [{
        statusCode: 200,
        body: {}
    }]
}

/**
 * Handle custom events
 * @param eventname event to call
 * @param body payload from module (parameters for other module call)
 * @param res response for caller module
 */
async function handle(eventname: string, body: Eventdata) {
    if (!bindings.has(eventname)) { //Return error if there are no subscriptions
        return [{
            "modulename": "kernel",
            "statuscode": 207,
            "detailedstatus": DetailedStatus.NO_SUBSCRIPTIONS,
            "content": []
        }];
    }


    const delegate = bindings.get(eventname); //Get event bindings
    const [results,] = await delegate.invokeAsync(undefined, eventname, body); //Call all subscribed modules with payload
    return results;
}

/**
 * Initialize Eventhandler
 * @param body payload from module
 * @param res response for module
 */
function init(body: Eventdata, secStream: peer.NoisePeer) {
    const handler = new RequestHandler(secStream, body.timeout); //Create new Handler for new Module on a new port
    handlers.set(body.modulename, handler);
    console.log("Init handler for " + body.modulename);
    return [{ //Return new port to module (used for listening Server)
        statuscode: 200,
        modulename: "kernel",
    }];
}

/**
 * Dispose Logic for modules
 * @param body payload from module
 * @param res response for module
 */
function disposeModule(body: Eventdata) {
    let result = false;
    const handler = handlers.get(body.modulename);
    for (const [eventname, delegate] of bindings) { //Iterate all bindings and remove every subscription of given module
        result = delegate.unbind(handler.request, handler);
        if (result) {
            console.log("Module " + body.modulename + " unsubscribed from " + eventname)
        }
    }
    handlers.delete(body.modulename); //Remove handler of module
    return [{
        statusCode: 200,
        body: {}
    }];
}

/**
 * Prototype function for logging, will be replaced later by customizable logger module collection
 * @param body payload from module
 * @param res response for module
 */
async function log(body: Eventdata) {
    if (!(body.payload["message"] as string).endsWith("\r\n"))
        body.payload["message"] += "\r\n";

    fs.appendFile('./Logs/log.txt', <string>body.payload["message"], (err) => {
        if (err) {
            console.error(err);
            return [{
                statusCode: 500,
                body: {}
            }];
        }

        return [{
            statusCode: 200,
            body: {}
        }];
    })
}