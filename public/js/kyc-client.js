/**
 * Verdex KYC client helper for Android WebView bridge / future web onboarding.
 * Server is authoritative for verified + p2p_eligible.
 */
(function (global) {
  'use strict';

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'kyc-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function VerdexKycClient(options) {
    this.baseUrl = (options && options.baseUrl) || '';
    this.getAccessToken = options && options.getAccessToken;
  }

  VerdexKycClient.prototype._headers = function (mutating) {
    var token = typeof this.getAccessToken === 'function' ? this.getAccessToken() : null;
    var h = {
      'Content-Type': 'application/json',
      'X-Trace-Id': uuid()
    };
    if (token) h.Authorization = 'Bearer ' + token;
    if (mutating) h['X-Idempotency-Key'] = uuid();
    return h;
  };

  VerdexKycClient.prototype._req = async function (path, method, body) {
    var res = await fetch(this.baseUrl + path, {
      method: method || 'GET',
      headers: this._headers(method && method !== 'GET'),
      body: body ? JSON.stringify(body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error((data.error && data.error.message) || 'KYC request failed');
      err.code = data.error && data.error.code;
      err.payload = data;
      throw err;
    }
    return data;
  };

  VerdexKycClient.prototype.getConfig = function () {
    return this._req('/api/kyc?action=config');
  };

  VerdexKycClient.prototype.getMe = function () {
    return this._req('/api/kyc?action=me');
  };

  VerdexKycClient.prototype.startCase = function (payload) {
    return this._req('/api/kyc?action=cases', 'POST', payload);
  };

  VerdexKycClient.prototype.submitProfile = function (caseId, payload) {
    return this._req('/api/kyc?action=profile&id=' + encodeURIComponent(caseId), 'POST', payload);
  };

  VerdexKycClient.prototype.requestUploadGrant = function (caseId, payload) {
    return this._req('/api/kyc?action=uploads&id=' + encodeURIComponent(caseId), 'POST', payload);
  };

  VerdexKycClient.prototype.completeUpload = function (caseId, payload) {
    return this._req(
      '/api/kyc?action=uploads&id=' + encodeURIComponent(caseId) + '&sub=complete',
      'POST',
      payload
    );
  };

  VerdexKycClient.prototype.submitCase = function (caseId, payload) {
    return this._req('/api/kyc?action=submit&id=' + encodeURIComponent(caseId), 'POST', payload || {});
  };

  /**
   * Canonical APK stepper order for UI implementation.
   */
  VerdexKycClient.STEPS = [
    { id: 'consent', title: 'Verify your identity' },
    { id: 'country', title: 'Where do you live?' },
    { id: 'profile', title: 'Confirm your details' },
    { id: 'document', title: 'Capture your document' },
    { id: 'liveness', title: 'Verify it is you' },
    { id: 'review', title: 'We are verifying your details' }
  ];

  global.VerdexKycClient = VerdexKycClient;
})(typeof window !== 'undefined' ? window : global);
