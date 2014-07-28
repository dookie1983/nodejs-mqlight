### mqlight.Client.unsubscribe(`topicPattern`, `[share]`, `[options]`, `[callback]`)

Stops the flow of messages from a destination to this client. The client's
message callback will not longer be driven when messages arrive, that match
the pattern associated with the destination. Messages may still be stored at
the destination if it has a non-zero time to live value or is shared and is
subscribed to by other clients instances.  

* `topicPattern` - (String) Matched against the `topicPattern` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will
  unsubscribed from.
* `share` - (String) (optional Matched against the `share` specified on the
  `mqlight.Client.subscribe` call to determine which destination the client will
  unsubscribed from.
* `options` - (Object) (optional) Properties that determine the behaviour of the
  unsubscribe operation:
  *  **ttl**, (Number) (optional) Sets the destination's time to live as part of
     the unsubscribe operation. The default (when this property is not
     specified) is not to change the destination's time to live. When specified
     the only valid value for this property is 0.
* `callback` - (Function) (optional) callback to be notified when the
  unsubscribe operation completes.
