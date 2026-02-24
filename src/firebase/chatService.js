import { db } from "./config";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";

// Enviar mensaje
export const sendMessage = async (productId, senderId, text) => {
  if (!text.trim()) return;
  
  const chatRef = collection(db, "articulos", productId, "chat");
  await addDoc(chatRef, {
    senderId,
    text,
    createdAt: serverTimestamp()
  });
};

// Escuchar mensajes (Tiempo real)
export const listenMessages = (productId, callback) => {
  const q = query(
    collection(db, "articulos", productId, "chat"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  });
};