import React from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";

// Publishable key
const stripePromise = loadStripe("pk_test_51SoyhfCWJMfCZ4i8GjYjbILfFOjutP7T6KT27Kv9t2xWWZCdk53VXjGfKHtE1NrBRiKIJlwZBMDjv0oryK4KpDkf000BSkzJPZ");

interface PaymentFormProps {
  jobId: string;
  amount: number;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ jobId, amount }) => {
  const stripe = useStripe();
  const elements = useElements();

  const handlePayment = async () => {
    if (!stripe || !elements) {
      console.error("Stripe.js has not loaded yet.");
      return;
    }

    try {
      // const token = localStorage.getItem("token"); // JWT token
      // Step 1: Call backend to create checkout session / PaymentIntent
      const response = await axios.post(
        "http://localhost:3000/payment/singlejob/payment/checkout",
        { amount, jobId },
        {
          headers: {
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0Njc1MzI1MS02Zjc3LTQxMzQtOTMzYS1lNGJmM2FmNjI5ZDUiLCJlbWFpbCI6InVzZXJAZ21haWwuY29tIiwicm9sZSI6IlVTRVIiLCJpYXQiOjE3NjgzNTc5OTIsImV4cCI6MTc2ODk2Mjc5Mn0.dVpLQFVtWtQwRC-RTZhMthlnueAWkXYcbC87pl_XV9Y`,
          },
        }
      );

      // // Step 2a: Stripe Checkout (hosted page)
      // if (data.url) {
      //   window.location.href = data.url; // Redirect user to hosted Stripe page
      //   return;
      // }

      // // Step 2b: Manual capture flow (PaymentIntent + Card Element)
      // if (data.clientSecret) {
      //   const cardElement = elements.getElement(CardElement);
      //   if (!cardElement) {
      //     console.error("CardElement not found");
      //     return;
      //   }

      //   const result = await stripe.confirmCardPayment(data.clientSecret, {
      //     payment_method: { card: cardElement }
      //   });

      //   if (result.error) {
      //     // Payment failed
      //     console.log("Payment failed:", result.error.message);
      //   } else if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
      //     // Payment successful
      //     console.log("Payment succeeded!");
      //     window.alert("Success");
      //   } else {
      //     // Payment incomplete / requires_action
      //     console.log("Payment incomplete:", result.paymentIntent.status);
      //     window.alert("Faild");
      //   }
      // }


      const backendData = response.data.data;

      if (backendData.clientSecret) {
        // const cardElement = elements.getElement(CardElement);

        const cardElement = elements.getElement(CardElement);

        // ১. চেক করুন cardElement আছে কি না
        if (!cardElement) {
          console.error("Card Element not found!");
          return;
        }

        // ২. এখন আপনি নিশ্চিন্তে cardElement ব্যবহার করতে পারবেন
        const result = await stripe.confirmCardPayment(backendData.clientSecret, {
          payment_method: {
            card: cardElement // এখন আর এরর দিবে না
          }
        });

        if (result.error) {
          console.log("Payment failed:", result.error.message);
          window.alert("Payment Failed: " + result.error.message);
        } else if (result.paymentIntent.status === "succeeded") {
          console.log("Payment succeeded!");
          window.alert("Success");
        }

      } else {
        console.error("Client Secret not found in response");
      }

    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Pay for Job</h2>
      <p style={styles.info}>Job ID: {jobId}</p>
      <p style={styles.info}>Amount: ${amount}</p>

      <div style={styles.cardBox}>
        <CardElement options={{ hidePostalCode: true }} />
      </div>

      <button style={styles.button} onClick={handlePayment}>
        Pay ${amount}
      </button>
    </div>
  );
};

function App() {
  const jobId = "05df6f1e-881d-4ef6-a710-77866c6f387d";
  const amount = 200;

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm jobId={jobId} amount={amount} />
    </Elements>
  );
}

export default App;



const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "400px",
    margin: "50px auto",
    padding: "20px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f9f9f9",
  },
  heading: {
    textAlign: "center",
    marginBottom: "20px",
  },
  info: {
    marginBottom: "10px",
    fontWeight: "bold",
  },
  cardBox: {
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    marginBottom: "20px",
    backgroundColor: "#fff",
  },
  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#6772e5",
    color: "#fff",
    fontSize: "16px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};