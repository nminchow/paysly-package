import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';

const url = 'https://us-central1-paysly-7e11b.cloudfunctions.net';

function formatAxiosError({response, request, message}) {
  if (response) {
    const code = 'response_failure'
    if (response.data) {
      return {
        code,
        ...response.data
      }
    }
    return {
      code,
      ...response
    };
  }
  if (request) {
    return {
      code: 'request_failure',
      request
    };
  }
  return {
    code: 'unknown_error',
    ...message
  };
};

const handleAxiosError = (axiosError) => Promise.reject(formatAxiosError(axiosError));

const handleResponse = ({ data: { success, ...data } }) => {
  if(!success) {
    return Promise.reject(data);
  }
  return data;
};

const publicKey = () => {
  return axios.get(`${url}/publicKey`).catch(
    handleAxiosError
  ).then(({ data: { publicKey } }) => publicKey);
};

export { publicKey };

export default async function Paysly(publicKey) {

  return loadStripe(publicKey).then(stripe => {
    stripe.createCharge = (element, tokenData, chargeData) => {
      return stripe.createToken(element, tokenData).then((result) => {
        if (result.error) {
          // Inform the user if there was an error.
          return Promise.reject(result.error);
        } else {
          return result.token;
        }
      }).then((token) => {
        // submit token to server
        return axios.post(`${url}/basicTokenize`, {
          token,
          chargeData,
          publicKey
        }).catch(handleAxiosError).then(handleResponse);
      });
    };

    stripe.createRecurring = (paymentMethodData, customerData, subscriptionData) => {
      return stripe.createPaymentMethod(paymentMethodData).then((result) => {
        if (result.error) {
          // Inform the user if there was an error.
          return Promise.reject(result.error);
        } else {
          return result.paymentMethod;
        }
      }).then((paymentMethod) => {
        // submit token to server
        return axios.post(`${url}/recurringTokenize`, {
          paymentMethod,
          customerData,
          subscriptionData,
          publicKey,
        }).catch(handleAxiosError).then(handleResponse);
      });
    };

    const redirectToCheckout = stripe.redirectToCheckout;

    stripe.redirectToCheckout = (checkoutData) => {
      return axios.post(`${url}/createCheckout`, {
        checkoutData,
        publicKey
      }).catch(handleAxiosError).then(handleResponse).then(({ id: sessionId }) => {
        redirectToCheckout({ sessionId });
      });
    };

    stripe.validateCheckout = () => {
      const params = new URLSearchParams(window.location.search);
      const session_id = params.get("paysly_session_id");
      if(!session_id) {
        return Promise.reject({
          type: 'paysly_error',
          code: 'no_session_on_page',
          message: 'A completed checkout session was not found on this page.'
        });
      }

      return axios.post(`${url}/validateCheckout`, {
        session_id,
        publicKey
      }).catch(handleAxiosError).then(handleResponse);
    };

    return stripe;
  });
};
