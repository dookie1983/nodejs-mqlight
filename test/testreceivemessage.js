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
/* jslint node: true */
/* jshint -W083,-W097 */
'use strict';


/** @const {string} enable unittest mode in mqlight.js */
process.env.NODE_ENV = 'unittest';

var mqlight = require('../mqlight');
var testCase = require('nodeunit').testCase;


/**
 * Helper function that returns a stub proton message object
 * @param {String} sentTopic the (simulated) topic passed into the send
 *                 method call used to send this message.
 * @param {String} subscribedPattern the (simulated) pattern passed into the
 *                 subscribe method call used to receive this message.
 * @return {object} a stub to be used in place of a proton message object.
 */
var testMessage = function(sentTopic, subscribedPattern) {
  return {
    destroyed: false,
    body: 'Hello World!',
    contentType: 'text/plain',
    address: 'amqp://host:5672/' + sentTopic,
    linkAddress: 'private:' + subscribedPattern,
    deliveryAnnotations: undefined,
    destroy: function() {
      this.destroyed = true;
    }
  };
};


/**
 * Tests the golden path for receiving a message
 * @param {object} test the unittest interface
 */
module.exports.test_receive_message = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  mqlight.proton.messenger.receive = function() {};

  var client = mqlight.createClient({service: 'amqp://host'});

  var first = true;
  client.connect(function(err) {
    test.ifError(err);
    client.on('message', function(data, delivery) {
      if (first) {
        test.deepEqual(delivery.destination.topicPattern, '/kittens/#');
        first = false;
      } else {
        test.deepEqual(delivery.destination.topicPattern, '/kittens/+/boots');
        test.done();
        client.disconnect();
        mqlight.proton.messenger.receive = originalReceiveMethod;
      }
    });
    client.subscribe('/kittens/#');
    client.subscribe('/kittens/+/boots');
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });

  var messages = [testMessage('/kittens/wearing/boots', '/kittens/#'),
                  testMessage('/kittens/wearing/boots', '/kittens/+/boots')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };
};


/**
 * Test that receiving a message on multiple subscriber patterns have the
 * correct topicPattern on the emitted message.
 * @param {object} test the unittest interface
 */
module.exports.test_receive_topic_pattern = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var messages = [testMessage('/kittens/boots', '/kittens/#')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.subscribe('/kittens/#');
  });

  client.on('message', function(data, delivery) {
    test.deepEqual(arguments.length, 2,
                   'expected 2 arguments to message event listener');
    test.deepEqual(data, 'Hello World!');
    test.ok(delivery.message !== undefined,
            "delivery object should have 'message' property");
    test.ok(delivery.message.properties !== undefined,
            "message object should have 'properties' property");
    test.deepEqual(delivery.message.properties.contentType, 'text/plain');
    test.deepEqual(delivery.message.topic, '/kittens/boots');
    test.ok(delivery.destination !== undefined,
            "delivery object should have 'destination' property");
    test.deepEqual(delivery.destination.topicPattern, '/kittens/#');

    // Ensure that the confirmDelivery() method is available to be called
    delivery.message.confirmDelivery();

    test.done();
    client.disconnect();
    mqlight.proton.messenger.receive = originalReceiveMethod;
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });
};


/**
 * Tests an error in a message listener isn't accidentally caugh in mqlight.js
 * and has the correct stack (referencing this file.
 * @param {object} test the unittest interface
 */
module.exports.test_bad_listener = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var messages = [testMessage('/public', '/public'), 
                  testMessage('/public', '/public')];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({
    service: 'amqp://host',
    id: 'test_bad_listener'
  });

  var handler = function(err) {
    var err_stack = err.stack.split('\n');
    if (err_stack[1].indexOf('testreceivemessage.js') < 0) {
      test.ok(false, 'Unexpected stack trace at ' + err_stack[1]);
      test.done();
    }
  };
  process.addListener('uncaughtException', handler);
  client.on('error', handler);

  client.connect(function() {
    var first = true;
    client.on('message', function(data, delivery) {
      // purposefully throw an exception the first time
      if (first === true) {
        first = false;
        throw new Error();
      }
      process.removeListener('uncaughtException', handler);
      test.done();
      client.disconnect();
      mqlight.proton.messenger.receive = originalReceiveMethod;
    });
    client.subscribe('/public');
  });
};


/**
 * Tests receiving a malformed message (e.g. one for which the various
 * 'x-opt-message-malformed-*' delivery annotations have been set)
 * @param {object} test the unittest interface
 */
module.exports.test_malformed_message = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var msg = testMessage('/kittens/fang', '/kittens/#');
  msg.deliveryAnnotations = [
    { key: 'x-opt-message-malformed-condition',
      key_type: 'symbol',
      value: 'PAYLOADNOTAMQP',
      value_type: 'symbol'
    },
    { key: 'x-opt-message-malformed-MQMD.Format',
      key_type: 'symbol',
      value: 'MQAMQP',
      value_type: 'string'
    },
    { key: 'x-opt-message-malformed-MQMD.CodedCharSetId',
      key_type: 'symbol',
      value: '1234',
      value_type: 'int32'
    },
    { key: 'x-opt-message-malformed-description',
      key_type: 'symbol',
      value: 'Not a well formed thingy.  Oh dear',
      value_type: 'string'
    }
  ];
  var messages = [msg];
  mqlight.proton.messenger.receive = function() {
    var result = messages;
    messages = [];
    return result;
  };

  var client = mqlight.createClient({service: 'amqp://host'});
  client.connect(function() {
    client.subscribe('/kittens/#');
  });

  client.on('malformed', function(data, delivery) {
    test.deepEqual(arguments.length, 2,
                   'expected 2 arguments to malformed event listener');
    test.deepEqual(data, 'Hello World!');
    test.ok(delivery.message !== undefined,
            "delivery object should have 'message' property");
    test.ok(delivery.message.properties !== undefined,
            "message object should have 'properties' property");
    test.deepEqual(delivery.message.properties.contentType, 'text/plain');
    test.deepEqual(delivery.message.topic, '/kittens/fang');
    test.ok(delivery.destination !== undefined,
            "delivery object should have 'destination' property");
    test.deepEqual(delivery.destination.topicPattern, '/kittens/#');
    test.ok(delivery.malformed !== undefined,
            "delivery object should have 'malformed' property");
    test.deepEqual(delivery.malformed.condition, 'PAYLOADNOTAMQP');
    test.deepEqual(delivery.malformed.description,
                   'Not a well formed thingy.  Oh dear');
    test.ok(delivery.malformed.MQMD !== undefined,
            "malformed object should have 'MQMD' property");
    test.deepEqual(delivery.malformed.MQMD.CodedCharSetId, 1234);
    test.deepEqual(delivery.malformed.MQMD.Format, 'MQAMQP');
    test.done();
    client.disconnect();
    mqlight.proton.messenger.receive = originalReceiveMethod;
  });

  client.on('message', function() {
    test.ok(false, 'message event should not be emitted');
  });

  client.on('error', function(err) {
    console.log(err, 'error event should not be emitted');
    test.ok(false);
  });
};


/**
 * Tests that the time-to-live value presented to applications is correctly
 * set from the value carried in the proton message object.
 * @param {object} test the unittest interface
 */
module.exports.test_receive_ttl = function(test) {
  var originalReceiveMethod = mqlight.proton.messenger.receive;
  var testMessageWithTtl = function(sentTopic, subscribedPattern, ttl) {
    var result = testMessage(sentTopic, subscribedPattern);
    result.ttl = ttl;
    return result;
  };
  var messages = [testMessageWithTtl('/public', '/public', 0), 
                  testMessageWithTtl('/public', '/public', 1000),
                  testMessageWithTtl('/public', '/public', Number.MAX_VALUE)
                 ];
  mqlight.proton.messenger.receive = function() {
    mqlight.proton.messenger.receive = originalReceiveMethod;
    return messages;
  };
  var count = 0;
  var client = mqlight.createClient({service: 'amqp://localhost'});
  client.connect(function() {
    client.subscribe('/public');
  }).on('message', function(data, delivery) {
    if (messages[count].ttl == 0) {
      test.ok(!delivery.message.ttl,
              'default ttl value in received message should result in ' +
              'no ttl property being present in delivery object');
    } else {
      test.deepEqual(messages[count].ttl, delivery.message.ttl,
                     'ttl presented via API (' + delivery.message.ttl +
                     ') should match that of received message (' +
                     messages[count].ttl + ')');
    }
    if (++count === messages.length) {
      client.disconnect();
      test.done();
    }
  });
};


/**
 * Parametrises a test case for checking that the credit value supplied
 * on a client.subscribe(...) call does not cause the client to stall
 * due to a logic error in when new messages are requested.
 *  
 * @param {object} test - the unittest interface
 * @param {Number} credit - the credit value to supply to client.subscribe(...)
 * @param {Number} qos - the qos level to use for the test
 * @param {Number} numMessages - the number of messages to simulate receiving
 */
function run_receiver_credit_testcase(test, credit, qos, numMessages) {

  var savedReceiveMethod = mqlight.proton.messenger.receive;
  var savedFlowMethod = mqlight.proton.messenger.flow;
  
  var maxCredit = credit;
  var currentCredit = maxCredit;
  mqlight.proton.messenger.receive = function() {
    test.ok(currentCredit >= 0, 'credit should never be negative');
    if (currentCredit > 0) {
      --currentCredit;
      return [testMessage('/kittens/wearing/boots', '/kittens/#')];
    } else {
      return [];
    }
  };
  mqlight.proton.messenger.flow = function(linkAddress, credit) {
    currentCredit += credit;
    test.ok(currentCredit <= maxCredit, 
            'maximum credit for link should never be exceeded');
  };
  
  var client = mqlight.createClient({service: 'amqp://host'});

  client.connect(function(err) {
    var receiveCount = 0;
    test.ifError(err);
    
    client.on('message', function(data, delivery) {
      if (++receiveCount >= numMessages) {
        client.disconnect();
        mqlight.proton.messenger.receive = savedReceiveMethod;
        mqlight.proton.messenger.flow = savedFlowMethod;
        test.done();
      }
    });
    
    client.subscribe('/kittens/#', {qos: qos, credit: maxCredit});
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    test.ok(false, 'error event should not be emitted');
  });
}


/**
 * Tests that a qos 0 subscription with a modest amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit10_qos0 = function(test) {
  run_receiver_credit_testcase(test, 10, 0, 250);
};


/**
 * Tests that a qos 0 subscription with a large amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit5000_qos0 = function(test) {
  run_receiver_credit_testcase(test, 5000, 0, 20000);
};


/**
 * Tests that a qos 0 subscription with the smallest amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit1_qos0 = function(test) {
  run_receiver_credit_testcase(test, 1, 0, 50);
};


/**
 * Tests that a qos 1 subscription with a modest amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit10_qos1 = function(test) {
  run_receiver_credit_testcase(test, 10, 0, 250);
};


/**
 * Tests that a qos 1 subscription with a large amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit5000_qos1 = function(test) {
  run_receiver_credit_testcase(test, 5000, 0, 20000);
};


/**
 * Tests that a qos 1 subscription with the smallest amount of credit
 * does not stall due to a problem requesting more credit.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit1_qos1 = function(test) {
  run_receiver_credit_testcase(test, 1, 0, 50);
};


/**
 * Tests that a qos 1 subscription using manual message confirmation does
 * not stall due to a problem requesting more credit.  The test sets a small
 * credit limit when subscribing and receives / confirms messages in batches.
 * 
 * @param {object} test the unittest interface
 */
module.exports.test_subscribe_credit_confirm = function(test) {
  var savedReceiveMethod = mqlight.proton.messenger.receive;
  var savedFlowMethod = mqlight.proton.messenger.flow;
  
  var maxCredit = 10;
  var currentCredit = maxCredit;
  mqlight.proton.messenger.receive = function() {
    test.ok(currentCredit >= 0, 'credit should never be negative');
    if (currentCredit > 0) {
      --currentCredit;
      return [testMessage('/kittens/wearing/boots', '/kittens/#')];
    } else {
      return [];
    }
  };
  mqlight.proton.messenger.flow = function(linkAddress, credit) {
    test.ok((currentCredit + credit) <= maxCredit, 
            'maximum credit for link should never be exceeded,'+
            ' current: ' + currentCredit + ' flowed: ' + credit +
            ' max: ' + maxCredit);
    currentCredit += credit;
  };
  
  var client = mqlight.createClient({service: 'amqp://host'});
  var deliveryArray = [];
  var interval = undefined;
  var confirmBatch = 0;

  client.connect(function(err) {
    var receiveCount = 0;
    test.ifError(err);
    
    client.on('message', function(data, delivery) {
      deliveryArray.push(delivery);
      if (++receiveCount >= 50) {
        if (interval) clearInterval(interval);
        test.ok(confirmBatch === 4);
        client.disconnect();
        mqlight.proton.messenger.receive = savedReceiveMethod;
        mqlight.proton.messenger.flow = savedFlowMethod;
        test.done();
      }
    });
    
    client.subscribe('/kittens/#', 
                     {qos: 1, credit: maxCredit, autoConfirm: false});
    

    interval = setInterval(function() {
      ++confirmBatch;
      test.ok(deliveryArray.length, maxCredit);
      while(deliveryArray.length > 0) {
        var delivery = deliveryArray.pop();
        delivery.message.confirmDelivery();
      }
      
    }, 250);
  });

  client.on('malformed', function() {
    test.ok(false, 'malformed event should not be emitted');
  });

  client.on('error', function(err) {
    test.ok(false, 'error event should not be emitted');
  });
};

