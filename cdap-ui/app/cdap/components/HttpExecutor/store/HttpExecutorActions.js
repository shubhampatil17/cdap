/*
 * Copyright © 2017 Cask Data, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const HttpExecutorActions = {
  setMethod: 'HTTP_SET_METHODS',
  setResponse: 'HTTP_SET_RESPONSE',
  enableLoading: 'HTTP_ENABLE_LOADING',
  setPath: 'HTTP_SET_PATH',
  setBody: 'HTTP_SET_BODY',
  setRequestTab: 'HTTP_SET_REQUEST_TAB',
  setHeaders: 'HTTP_SET_REQUEST_HEADERS',
  reset: 'HTTP_RESET',
  setRequestLog: 'HTTP_SET_REQUEST_LOG',
  setRequestHistoryView: 'HTTP_SET_REQUEST_HISTORY_VIEW',
};

export default HttpExecutorActions;
