const BaseModel = require('./BaseModel');

class ChatSession extends BaseModel {
  constructor() {
    super('chat_sessions');
  }
}

module.exports = ChatSession;
