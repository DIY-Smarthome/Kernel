import * as fs from 'fs';
import * as https from 'http';

import Delegate from '../Delegate/Delegate';
import { DetailedStatus } from '../enums/DetailedStatus';
import { Eventdata } from '../interfaces/Eventdata';
import { SubscriptionChangeData } from '../interfaces/SubscriptionChangeData';
import RequestHandler from './requester';

//Open server for Requests
const server = https.createServer({}, (req, res) => {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString(); // convert Buffer to string and collect chunks
    });
    req.on('end', () => {
        const data: Eventdata = JSON.parse(body);
        body = "";
        switch (req.url) { //Evaluate eventname
            case "/kernel/subscribe":
                subscribe(data, res);
                break;
            case "/kernel/unsubscribe":
                unsubscribe(data, res);
                break;
            case "/kernel/init":
                init(data, res);
                break;
            case "/kernel/dispose":
                disposeModule(data, res);
                break;
            case "/kernel/log":
                log(data, res);
                break;
            default: //Handle all custom events
                handle(req.url.substring(1), data, res);
                break;
        }
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

let lastPort = 8000;
const handlers = new Map<number, RequestHandler>(); //All handlers for modules
const bindings = new Map<string, Delegate<(...args: unknown[]) => unknown>>(); //All event bindings
//let middlewares = new Map<string, Delegate<(...args: any) => any>>(); currently unused

/**
 * Subscription logic
 * @param body payload from module
 * @param res response for module
 */
function subscribe(body: Eventdata, res: https.ServerResponse) {
    const eventdata: SubscriptionChangeData = <SubscriptionChangeData>body.payload;
    if (!bindings.has(eventdata.eventname)) //Create new Delegate if there is none
        bindings.set(eventdata.eventname, new Delegate())
    const handler = handlers.get(body.port); //Get the Delegate
    const result = bindings.get(eventdata.eventname).bind(handler.request, handler); //Bind new handler to event
    if (result) { //Log varying success
        console.log("Module " + body.modulename + " subscribed to " + eventdata.eventname)
    } else {
        console.log("Module " + body.modulename + " tried to subscribe to " + eventdata.eventname + " but was already subscribed.")
    }
    res.statusCode = 200;
    res.end();
}

/**
 * Unsubscribe Logic
 * @param body payload from module
 * @param res response for module
 */
function unsubscribe(body: Eventdata, res: https.ServerResponse) {
    const eventdata: SubscriptionChangeData = <SubscriptionChangeData>body.payload;
    const handler = handlers.get(body.port);

    let result = false;
    if (bindings.has(eventdata.eventname)) //Remove handler binding
        result = bindings.get(eventdata.eventname).unbind(handler.request, handler);

    //Log varying success
    if (result) {
        console.log("Module " + body.modulename + " unsubscribed from " + eventdata.eventname)
    } else {
        console.log("Module " + body.modulename + " tried to unsubscribe from " + eventdata.eventname + " but wasn't subscribed!")
    }

    res.statusCode = 200;
    res.end();
}

/**
 * Handle custom events
 * @param eventname event to call
 * @param body payload from module (parameters for other module call)
 * @param res response for caller module
 */
async function handle(eventname: string, body: Eventdata, res: https.ServerResponse) {
    if (!bindings.has(eventname)) { //Return error if there are no subscriptions
        res.write(JSON.stringify([{
            "modulename": "kernel",
            "statuscode": 207,
            "detailedstatus": DetailedStatus.NO_SUBSCRIPTIONS,
            "content": []
        }]))
        res.statusCode = 200;
        res.end();
        return;
    }


    const delegate = bindings.get(eventname); //Get event bindings
    const [results,] = await delegate.invokeAsync(undefined, eventname, body); //Call all subscribed modules with payload
    res.write(JSON.stringify(results));
    res.statusCode = 200;
    res.end();
}

/**
 * Initialize Eventhandler
 * @param body payload from module
 * @param res response for module
 */
function init(body: Eventdata, res: https.ServerResponse) {
    const handler = new RequestHandler('127.0.0.1', ++lastPort); //Create new Handler for new Module on a new port
    handlers.set(lastPort, handler);
    res.write(JSON.stringify([{ //Return new port to module (used for listening Server)
        statuscode: 200,
        modulename: "kernel",
        content: lastPort
    }]));
    res.statusCode = 200;
    res.end();
    console.log("Init handler for " + lastPort)
}

/**
 * Dispose Logic for modules
 * @param body payload from module
 * @param res response for module
 */
function disposeModule(body: Eventdata, res: https.ServerResponse) {
    let result = false;
    const handler = handlers.get(body.port);
    for (const [eventname, delegate] of bindings) { //Iterate all bindings and remove every subscription of given module
        result = delegate.unbind(handler.request, handler);
        if (result) {
            console.log("Module " + body.modulename + " unsubscribed from " + eventname)
        }
    }
    handlers.delete(body.port); //Remove handler of module
    res.statusCode = 200;
    res.end();
}

/**
 * Prototype function for logging, will be replaced later by customizable logger module collection
 * @param body payload from module
 * @param res response for module
 */
async function log(body: Eventdata, res: https.ServerResponse) {
    if (!(body.payload["message"] as string).endsWith("\r\n"))
        body.payload["message"] += "\r\n";

    fs.appendFile('./Logs/log.txt', <string>body.payload["message"], (err) => {
        if (err) {
            console.error(err);
            res.statusCode = 500;
        } else {
            res.statusCode = 200;
        }
        res.end();
    })
}