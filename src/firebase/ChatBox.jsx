import { useState, useEffect, useRef } from 'react';
import { sendMessage, listenMessages } from '../firebase/chatService';
import { Send } from 'lucide-react';

export default function ChatBox({ productId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef();

  useEffect(() => {
    const unsubscribe = listenMessages(productId, setMessages);
    return () => unsubscribe();
  }, [productId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(productId, currentUser.uid, newMessage);
    setNewMessage("");
  };

  return (
    <div className="flex flex-col h-[400px] bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
      <div className="bg-forest-green p-4 text-white font-black text-xs uppercase tracking-widest">
        Chat de Entrega
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
              msg.senderId === currentUser.uid 
              ? 'bg-forest-green text-white rounded-tr-none' 
              : 'bg-smoke-white text-gray-700 rounded-tl-none border border-gray-100'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 bg-gray-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-forest-green"
        />
        <button type="submit" className="bg-forest-green text-white p-2 rounded-xl hover:scale-105 transition">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}