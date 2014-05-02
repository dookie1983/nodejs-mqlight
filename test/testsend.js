/* %Z% %W% %I% %E% %U% */
/*
 * <copyright
 * notice="lm-source-program"
 * pids="5755-P60"
 * years="2013,2014"
 * crc="3568777996" >
 * Licensed Materials - Property of IBM
 *
 * 5755-P60
 *
 * (C) Copyright IBM Corp. 2014
 *
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with
 * IBM Corp.
 * </copyright>
 */


/** @const {string} enable unittest mode in mqlight.js */
process.env.NODE_ENV = 'unittest';

var testCase = require('nodeunit').testCase;
var mqlight = require('../mqlight');


/**
 * Test that supplying too few arguments to client.send(...) results in an
 * error being thrown.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_few_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    test.throws(
        function() {
          send();
        }
    );
    test.throws(
        function() {
          send('topic');
        }
    );
    client.disconnect();
    test.done();
  });
};


/**
 * Test that if too many arguments are supplied to client.send(...) then the
 * additional arguments are ignore.
 * @param {object} test the unittest interface
 */
module.exports.test_send_too_many_arguments = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    test.doesNotThrow(
        function() {
          client.send('topic', 'message', {}, function() {}, 'interloper');
        }
    );
    client.disconnect();
    test.done();
  });
};


/**
 * Test a variety of valid and invalid topic names.  Invalid topic names
 * should result in the client.send(...) method throwing a TypeError.
 * @param {object} test the unittest interface
 */
module.exports.test_send_topics = function(test) {
  var data = [{valid: false, topic: ''},
              {valid: false, topic: undefined},
              {valid: false, topic: null},
              {valid: true, topic: 1234},
              {valid: true, topic: function() {}},
              {valid: true, topic: 'kittens'},
              {valid: true, topic: '/kittens'}];

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].valid) {
        test.doesNotThrow(
            function() {
              client.send(data[i].topic, 'message');
            }
        );
      } else {
        test.throws(
            function() {
              client.send(data[i].topic, 'message');
            },
            TypeError,
            'topic should have been rejected: ' + data[i].topic
        );
      }
    }
    client.disconnect();
    test.done();
  });
};


/**
 * Tests sending a variety of different message body types.  Each type should
 * result in one of the following outcomes:
 * <ul>
 *   <li>error - the client.send(...) call throws an error.</li>
 *   <li>string - the data is passed to proton as a string.</li>
 *   <li>buffer - the data is passed to proton as a buffer.</li>
 *   <li>json - the data is passed to proton as a string containing JSON.</li>
 * </li>
 * @param {object} test the unittest interface
 */
module.exports.test_send_payloads = function(test) {
  var data = [{result: 'error', message: undefined},
              {result: 'error', message: function() {}},
              {result: 'string', message: 'a string'},
              {result: 'string', message: ''},
              {result: 'buffer', message: new Buffer('abc')},
              {result: 'buffer', message: new Buffer(0)},
              {result: 'json', message: null},
              {result: 'json', message: {}},
              {result: 'json', message: {color: 'red'}},
              {result: 'json', message: {func: function() {}}},
              {result: 'json', message: []},
              {result: 'json', message: [1, 'red']},
              {result: 'json', message: [true, function() {}]},
              {result: 'json', message: 123},
              {result: 'json', message: 3.14159},
              {result: 'json', message: true}];

  // Override the implementation of the 'put' method on the stub object the
  // unit tests use in place of the native proton code.
  var savedPutMethod = mqlight.proton.messenger.put;
  var lastMsg;
  mqlight.proton.messenger.put = function(message) {
    lastMsg = message;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    for (var i = 0; i < data.length; ++i) {
      if (data[i].result === 'error') {
        test.throws(
            function() {client.send('topic', data[i].message);},
            TypeError,
            'expected send(...) to reject a payload of ' + data[i].message);
      } else {
        test.doesNotThrow(
            function() {
              client.send('topic', data[i].message);
            }
        );
        switch (data[i].result) {
          case ('string'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, data[i].message);
            test.equals(lastMsg.contentType, 'text/plain');
            break;
          case ('buffer'):
            test.ok(lastMsg.body instanceof Buffer);
            test.deepEqual(lastMsg.body, data[i].message);
            break;
          case ('json'):
            test.ok(typeof lastMsg.body === 'string');
            test.deepEqual(lastMsg.body, JSON.stringify(data[i].message));
            test.equals(lastMsg.contentType, 'application/json');
            break;
          default:
            test.ok(false, "unexpected result type: '" + data[i].result + "'");
        }
      }
    }

    client.disconnect(function() {
      // Restore original implementation of 'put' method before completing.
      mqlight.proton.messenger.put = savedPutMethod;
      test.done();
    });
  });
};


/**
 * Tests that, if a callback function is supplied to client.test(...) then the
 * function is invoked when the send operation completes, and this references
 * the client.
 * @param {object} test the unittest interface
 */
module.exports.test_send_callback = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.send('topic', 'message', {}, function() {
      // TODO: defect 59405 might mean we change what arguments are passed into
      //       this callback...
      // test.equal(arguments.length, 0);
      test.ok(this === client);
      client.disconnect();
      test.done();
    });
  });
};


/**
 * Tests that client.send(...) throws and error if it is called while the
 * client is in disconnected state.
 * @param {object} test the unittest interface
 */
module.exports.test_send_fails_if_disconneced = function(test) {
  var client = mqlight.createClient({service: 'amqp://host'});
  test.throws(
      function() {
        client.send('topic', 'message');
      },
      Error
  );
  test.done();
};