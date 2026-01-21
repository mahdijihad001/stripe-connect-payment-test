import { useState, useEffect, useRef } from 'react';
import { Send, User, MessageCircle, LogOut, CreditCard, MessageSquare } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe("pk_test_51SoyhfCWJMfCZ4i8GjYjbILfFOjutP7T6KT27Kv9t2xWWZCdk53VXjGfKHtE1NrBRiKIJlwZBMDjv0oryK4KpDkf000BSkzJPZ");

interface Message {
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string;
  sender?: { userId: string; name: string; };
  receiver?: { userId: string; name: string; };
}

interface ApiResponse {
  success: boolean;
  message: string;
  data: Message;
}

const API_BASE_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3000/socket/message';

const chatApi = {
  get: async (url: string, token: string): Promise<Message[]> => {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },
  post: async (url: string, data: { receiverId: string; text: string }, token: string): Promise<ApiResponse> => {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};

const PaymentForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [jobId, setJobId] = useState('');
  const [bidId, setBidId] = useState('');
  const [amount, setAmount] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [processing, setProcessing] = useState(false);

  const handlePayment = async () => {
    if (!stripe || !elements) {
      alert("Stripe loaded hoy nai");
      return;
    }
    if (!jobId.trim() || !amount.trim() || !jwtToken.trim()) {
      alert("Sob field fill koro");
      return;
    }
    setProcessing(true);
    try {
      const response = await fetch("http://localhost:3000/payment/singlejob/payment/checkout", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ amount: parseFloat(amount), jobId, bidId })
      });
      const result = await response.json();
      const backendData = result.data;
      if (backendData.clientSecret) {
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          alert("Card Element load hoy nai");
          setProcessing(false);
          return;
        }
        const paymentResult = await stripe.confirmCardPayment(backendData.clientSecret, {
          payment_method: { card: cardElement }
        });
        if (paymentResult.error) {
          alert("Payment Failed: " + paymentResult.error.message);
        } else if (paymentResult.paymentIntent.status === "succeeded") {
          alert("Payment Successful! ✅");
          setJobId('');
          setAmount('');
          setJwtToken('');
        }
      } else {
        alert("Client Secret paoa jay nai");
      }
    } catch (err) {
      console.error(err);
      alert("Payment process e error hoyeche");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={s.fullScreen}>
      <div style={s.paymentWrap}>
        <div style={s.payCard}>
          <div style={s.payHead}>
            <div style={s.iconCirc}>
              <CreditCard size={56} color="#667eea" />
            </div>
            <h1 style={s.mainTit}>Payment Gateway</h1>
            <p style={s.mainSub}>Complete your job payment securely with Stripe</p>
          </div>
          <div style={s.payForm}>
            <div style={s.fGroup}>
              <label style={s.fLabel}><span style={s.labIcon}>📋</span> Job ID</label>
              <input type="text" value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Enter your job ID" style={s.fInput} />
            </div>
            <div style={s.fGroup}>
              <label style={s.fLabel}><span style={s.labIcon}>📋</span> BidId ID</label>
              <input type="text" value={bidId} onChange={(e) => setBidId(e.target.value)} placeholder="Enter your job ID" style={s.fInput} />
            </div>
            <div style={s.fGroup}>
              <label style={s.fLabel}><span style={s.labIcon}>💵</span> Amount (USD)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter payment amount" style={s.fInput} />
            </div>
            <div style={s.fGroup}>
              <label style={s.fLabel}><span style={s.labIcon}>🔐</span> JWT Token</label>
              <input type="password" value={jwtToken} onChange={(e) => setJwtToken(e.target.value)} placeholder="Enter your authentication token" style={s.fInput} />
            </div>
            <div style={s.fGroup}>
              <label style={s.fLabel}><span style={s.labIcon}>💳</span> Card Details</label>
              <div style={s.cardBox}>
                <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: '16px', color: '#1f2937', '::placeholder': { color: '#9ca3af' } } } }} />
              </div>
            </div>
            <button onClick={handlePayment} disabled={processing || !stripe} style={{ ...s.payBtn, opacity: processing || !stripe ? 0.6 : 1, cursor: processing || !stripe ? 'not-allowed' : 'pointer' }}>
              {processing ? <><span style={s.spin}></span> Processing Payment...</> : <>💰 Pay ${amount || '0.00'}</>}
            </button>
          </div>
          <div style={s.secFoot}>
            <span style={s.lock}>🔒</span>
            <span style={s.secTxt}>Secured by Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatApp = () => {
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [receiverId, setReceiverId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isLoggedIn && currentUserId) {
      const newSocket = io(SOCKET_URL, { query: { userId: currentUserId }, transports: ['websocket', 'polling'] });
      newSocket.on('connect', () => { console.log('Socket connected'); setIsConnected(true); });
      newSocket.on('disconnect', () => { console.log('Socket disconnected'); setIsConnected(false); });
      newSocket.on('receive-message', (message: Message) => {
        console.log('New message received:', message);
        if (message.senderId === receiverId || message.receiverId === receiverId) {
          setMessages(prev => [...prev, message]);
        }
      });
      setSocket(newSocket);
      return () => { newSocket.disconnect(); };
    }
  }, [isLoggedIn, currentUserId, receiverId]);

  const handleLogin = () => {
    if (currentUserId.trim() && token.trim()) { setIsLoggedIn(true); } else { alert('User ID ebong Token provide koro'); }
  };

  const handleLogout = () => {
    if (socket) { socket.disconnect(); }
    setIsLoggedIn(false);
    setMessages([]);
    setReceiverId('');
  };

  const loadMessageHistory = async () => {
    if (!receiverId.trim()) { alert('Receiver ID provide koro'); return; }
    try {
      const data = await chatApi.get(`/message/history?withUserId=${receiverId}`, token);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
      alert('Message history load korte problem hoyeche');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !receiverId.trim()) { alert('Message ebong Receiver ID provide koro'); return; }
    try {
      const response = await chatApi.post('/message/send', { receiverId, text: newMessage }, token);
      if (response.success) {
        setMessages(prev => [...prev, response.data]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Message pathate problem hoyeche');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  if (!isLoggedIn) {
    return (
      <div style={s.fullScreen}>
        <div style={s.chatLogWrap}>
          <div style={s.chatLogCard}>
            <div style={s.chatLogHead}>
              <div style={s.iconCirc}>
                <MessageSquare size={56} color="#667eea" />
              </div>
              <h1 style={s.mainTit}>Welcome to Chat</h1>
              <p style={s.mainSub}>Login to start messaging with your friends</p>
            </div>
            <div style={s.chatLogForm}>
              <div style={s.fGroup}>
                <label style={s.fLabel}><span style={s.labIcon}>👤</span> User ID</label>
                <input type="text" value={currentUserId} onChange={(e) => setCurrentUserId(e.target.value)} placeholder="Enter your user ID" style={s.fInput} />
              </div>
              <div style={s.fGroup}>
                <label style={s.fLabel}><span style={s.labIcon}>🔐</span> JWT Token</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Enter your authentication token" style={s.fInput} />
              </div>
              <button onClick={handleLogin} style={s.chatLogBtn}>🚀 Login to Chat</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.fullScreen}>
      <div style={s.chatWrap}>
        <div style={s.chatCard}>
          <div style={s.chatHead}>
            <div style={s.chatHL}>
              <div style={s.chatAva}>
                <User size={28} color="#fff" />
              </div>
              <div style={s.chatHI}>
                <h2 style={s.chatHT}>Live Chat</h2>
                <div style={s.chatSB}>
                  <span style={{ ...s.chatSD, backgroundColor: isConnected ? '#10b981' : '#ef4444' }}></span>
                  <span style={s.chatST}>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
            </div>
            <button onClick={handleLogout} style={s.chatLB}>
              <LogOut size={22} />
              <span style={s.logTxt}>Logout</span>
            </button>
          </div>
          <div style={s.chatRS}>
            <input type="text" value={receiverId} onChange={(e) => setReceiverId(e.target.value)} placeholder="Enter receiver's user ID" style={s.chatRI} />
            <button onClick={loadMessageHistory} style={s.chatLdBtn}>📥 Load Chat</button>
          </div>
          <div style={s.chatMC}>
            {messages.length === 0 ? (
              <div style={s.chatES}>
                <MessageCircle size={80} color="#cbd5e1" />
                <p style={s.chatET}>No messages yet</p>
                <p style={s.chatESub}>Enter a receiver ID and load chat to start messaging</p>
              </div>
            ) : (
              <div style={s.chatML}>
                {messages.map((msg, idx) => {
                  const isSentByMe = msg.senderId === currentUserId;
                  return (
                    <div key={idx} style={{ ...s.chatMR, justifyContent: isSentByMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ ...s.chatMB, ...(isSentByMe ? s.chatMS : s.chatMRec) }}>
                        <p style={s.chatMSen}>{isSentByMe ? '🙋 You' : '👤 ' + (msg.sender?.name || 'Unknown')}</p>
                        <p style={s.chatMTxt}>{msg.text}</p>
                        <p style={s.chatMTim}>{new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          <div style={s.chatIS}>
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={handleKeyPress} placeholder="Type your message..." style={s.chatMI} />
            <button onClick={handleSendMessage} style={s.chatSB2}>
              <Send size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'payment' | 'chat'>('payment');

  return (
    <div style={s.appCont}>
      <div style={s.nav}>
        <div style={s.navCont}>
          <div style={s.logo}>
            <span style={s.logoI}>⚡</span>
            <span style={s.logoT}>PayChat</span>
          </div>
          <div style={s.navTabs}>
            <button onClick={() => setActiveTab('payment')} style={{ ...s.navTab, ...(activeTab === 'payment' ? s.navTabAct : {}) }}>
              <CreditCard size={20} />
              <span>Payment</span>
            </button>
            <button onClick={() => setActiveTab('chat')} style={{ ...s.navTab, ...(activeTab === 'chat' ? s.navTabAct : {}) }}>
              <MessageSquare size={20} />
              <span>Chat</span>
            </button>
          </div>
        </div>
      </div>
      <div style={s.mainCont}>
        {activeTab === 'payment' ? (
          <Elements stripe={stripePromise}>
            <PaymentForm />
          </Elements>
        ) : (
          <ChatApp />
        )}
      </div>
    </div>
  );
}

const s: { [key: string]: React.CSSProperties } = {
  appCont: { width: '100%', minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', flexDirection: 'column' },
  nav: { background: 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', padding: '16px 24px' },
  navCont: { maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' },
  logo: { display: 'flex', alignItems: 'center', gap: '12px' },
  logoI: { fontSize: '32px' },
  logoT: { fontSize: '24px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.5px' },
  navTabs: { display: 'flex', gap: '12px', background: 'rgba(255, 255, 255, 0.1)', padding: '6px', borderRadius: '16px', backdropFilter: 'blur(10px)' },
  navTab: { padding: '12px 28px', background: 'transparent', border: 'none', borderRadius: '12px', color: 'rgba(255, 255, 255, 0.8)', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s ease' },
  navTabAct: { background: '#ffffff', color: '#667eea', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' },
  mainCont: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0' },
  fullScreen: { width: '100%', minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' },
  paymentWrap: { width: '100%', maxWidth: '700px' },
  payCard: { background: '#ffffff', borderRadius: '32px', boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)', padding: '50px', position: 'relative', overflow: 'hidden' },
  iconCirc: { width: '120px', height: '120px', borderRadius: '50%', background: 'linear-gradient(135deg, #f0f4ff 0%, #e5edff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', boxShadow: '0 10px 30px rgba(102, 126, 234, 0.2)' },
  payHead: { textAlign: 'center', marginBottom: '40px' },
  mainTit: { fontSize: '36px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0', letterSpacing: '-0.5px' },
  mainSub: { fontSize: '16px', color: '#6b7280', margin: 0, lineHeight: '1.6' },
  payForm: { display: 'flex', flexDirection: 'column', gap: '24px' },
  fGroup: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fLabel: { fontSize: '15px', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' },
  labIcon: { fontSize: '18px' },
  fInput: { padding: '16px 20px', fontSize: '16px', border: '2px solid #e5e7eb', borderRadius: '14px', outline: 'none', transition: 'all 0.3s ease', fontFamily: 'inherit', background: '#fafafa' },
  cardBox: { padding: '18px 20px', border: '2px solid #e5e7eb', borderRadius: '14px', background: '#fafafa', transition: 'all 0.3s ease' },
  payBtn: { padding: '18px', fontSize: '18px', fontWeight: '700', color: '#ffffff', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.3s ease', marginTop: '16px', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  spin: { width: '20px', height: '20px', border: '3px solid rgba(255, 255, 255, 0.3)', borderTop: '3px solid #ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  secFoot: { marginTop: '32px', padding: '20px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  lock: { fontSize: '20px' },
  secTxt: { fontSize: '14px', fontWeight: '600', color: '#059669' },
  chatWrap: { width: '100%', maxWidth: '1200px', height: 'calc(100vh - 120px)' },
  chatLogWrap: { width: '100%', maxWidth: '600px' },
  chatLogCard: { background: '#ffffff', borderRadius: '32px', boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)', padding: '50px' },
  chatLogHead: { textAlign: 'center', marginBottom: '40px' },
  chatLogForm: { display: 'flex', flexDirection: 'column', gap: '24px' },
  chatLogBtn: { padding: '18px', fontSize: '18px', fontWeight: '700', color: '#ffffff', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.3s ease', marginTop: '16px', boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)' },
  chatCard: { background: '#ffffff', borderRadius: '32px', boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatHead: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' },
  chatHL: { display: 'flex', alignItems: 'center', gap: '20px' },
  chatAva: { width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', border: '2px solid rgba(255, 255, 255, 0.3)' },
  chatHI: { display: 'flex', flexDirection: 'column', gap: '6px' },
  chatHT: { fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: 0 },
  chatSB: { display: 'flex', alignItems: 'center', gap: '8px' },
  chatSD: { width: '10px', height: '10px', borderRadius: '50%' },
  chatST: { fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500' },
  chatLB: { padding: '12px 24px', background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '12px', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s ease', backdropFilter: 'blur(10px)', fontSize: '15px', fontWeight: '600' },
  logTxt: { display: 'inline' },
  chatRS: { padding: '24px 32px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '16px', flexWrap: 'wrap' },
  chatRI: { flex: '1', minWidth: '250px', padding: '14px 20px', fontSize: '16px', border: '2px solid #e5e7eb', borderRadius: '14px', outline: 'none', transition: 'all 0.3s ease', fontFamily: 'inherit', background: '#ffffff' },
  chatLdBtn: { padding: '14px 32px', fontSize: '16px', fontWeight: '600', color: '#ffffff', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', borderRadius: '14px', cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)' },
  chatMC: { flex: 1, overflowY: 'auto', padding: '32px', background: '#f9fafb' },
  chatES: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' },
  chatET: { fontSize: '24px', fontWeight: '700', color: '#6b7280', margin: 0 },
  chatESub: { fontSize: '16px', color: '#9ca3af', margin: 0, textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' },
  chatML: { display: 'flex', flexDirection: 'column', gap: '16px' },
  chatMR: { display: 'flex' },
  chatMB: { maxWidth: '70%', padding: '14px 18px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', wordWrap: 'break-word', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' },
  chatMS: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#ffffff', borderBottomRightRadius: '6px' },
  chatMRec: { background: '#ffffff', color: '#1f2937', borderBottomLeftRadius: '6px' },
  chatMSen: { fontSize: '13px', fontWeight: '700', opacity: 0.9, margin: 0 },
  chatMTxt: { fontSize: '16px', lineHeight: '1.6', margin: 0 },
  chatMTim: { fontSize: '12px', opacity: 0.75, margin: 0, textAlign: 'right' },
  chatIS: { padding: '24px 32px', background: '#ffffff', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '16px', alignItems: 'center' },
  chatMI: { flex: 1, padding: '16px 22px', fontSize: '16px', border: '2px solid #e5e7eb', borderRadius: '24px', outline: 'none', transition: 'all 0.3s ease', fontFamily: 'inherit' },
  chatSB2: { width: '56px', height: '56px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', borderRadius: '50%', color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease', boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)' }
};
