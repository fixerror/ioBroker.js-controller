'use strict';
const CLI = require('./messages.js');
const CLICommand = require('./cliCommand.js');
const tools = require('../tools.js');
const { enumInstances } = require('./cliTools');

/** Command iobroker object ... */
module.exports = class CLIMessage extends CLICommand {

    /** @param {import('./cliCommand').CLICommandOptions} options */
    constructor(options) {
        super(options);
    }

    /**
     * Executes a command
     * @param {any[]} args
     */
    execute(args) {
        const { callback, dbConnect, showHelp } = this.options;
        /** @type {[string, string, any?]} */
        // eslint-disable-next-line prefer-const
        let [adapter, command, message] = (args);
        if (adapter == undefined) {
            CLI.error.requiredArgumentMissing('adapter');
            showHelp();
            return void callback(1);
        }
        if (message == undefined) {
            if (command == undefined) {
                CLI.error.requiredArgumentMissing('message');
                showHelp();
                return void callback(1);
            }
            message = command;
            command = 'send';
        }
        // Try to parse JSON
        // TODO: can we use the methods from cliObjects?
        if (
            typeof message === 'string'
            && message.startsWith('{')
            && message.endsWith('}')
        ) {
            message = JSON.parse(message);
        }

        dbConnect((objects, states) => {
            tools.poorMansAsync(function* () {
                const adapterInstances = yield enumInstances(objects, adapter);
                if (adapterInstances.length === 0) {
                    CLI.error.noInstancesFound(adapter);
                    return void callback(1);
                }

                /** @type {string[]} */
                const messageTargets = adapterInstances.map(row => row._id);
                if (!/\.\d+$/.test(adapter)) {
                    // This message wasn't meant for a specific instance,
                    // add the adapter object to the targets
                    messageTargets.unshift(`system.adapter.${adapter}`);
                }

                // Send the message to all targets
                const messagePromises = messageTargets.map(
                    t => sendMessage(states, t, command, message)
                );
                yield Promise.all(messagePromises);
                return void callback();

            })().catch(err => {
                CLI.error.unknown(err);
                return void callback(1);
            });
        });
    }
};

/**
 * @param {any} states The States DB
 * @param {string} targetId The instance or adapter to send the message to
 * @param {string} command The command to send
 * @param {any} message The message to send
 * @returns {Promise<void>}
 */
function sendMessage(states, targetId, command, message) {
    return new Promise(resolve => {
        states.pushMessage(targetId, { command, message, from: 'cli' }, () => {
            CLI.success.messageSent(targetId, command, message);
            resolve();
        });
    });
}