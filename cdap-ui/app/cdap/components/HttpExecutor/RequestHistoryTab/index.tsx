/*
 * Copyright © 2020 Cask Data, Inc.
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

import Button from '@material-ui/core/Button';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import withStyles, { StyleRules, WithStyles } from '@material-ui/core/styles/withStyles';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ClearDialog from 'components/HttpExecutor/RequestHistoryTab/RequestActionDialogs/ClearDialog';
import RequestRow from 'components/HttpExecutor/RequestHistoryTab/RequestRow';
import RequestSearch from 'components/HttpExecutor/RequestHistoryTab/RequestSearch';
import HttpExecutorActions from 'components/HttpExecutor/store/HttpExecutorActions';
import HttpExecutorStore from 'components/HttpExecutor/store/HttpExecutorStore';
import If from 'components/If';
import { List, Map } from 'immutable';
import * as React from 'react';
import { connect } from 'react-redux';

// Every key in localStorage that belongs to requestHistoryTab starts with requestHistoryIdentifier
const REQUEST_HISTORY_IDENTIFIER = 'RequestHistory';

export interface IIncomingRequest {
  status: IncomingRequestStatus;
  requestID: Date;
}

export enum IncomingRequestStatus {
  ADD = 'ADD',
  DELETE = 'DELETE',
  NORMAL = 'NORMAL',
  CLEAR = 'CLEAR',
}

export enum RequestMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export interface IRequestHistory {
  requestID: Date;
  method: RequestMethod;
  path: string;
  body: string;
  headers: {
    pairs: [
      {
        key: string;
        value: string;
        uniqueId: string;
      }
    ];
  };
  response: string;
  statusCode: number;
}

const styles = (theme): StyleRules => {
  return {
    root: {
      borderRight: `1px solid ${theme.palette.grey[300]}`,
      height: '100%',
    },
    requestLogManager: {
      display: 'grid',
      width: '100%',
      gridTemplateColumns: 'repeat(7, 1fr)',
    },
    saveResponses: {
      gridColumnStart: '1',
      gridColumnEnd: '5',
    },
    clearAll: {
      gridColumnStart: '7',
    },
    timestampGroup: {
      display: 'flex',
      flexFlow: 'column',
      padding: '0',
    },
  };
};

const StyledExpansionPanel = withStyles(() => ({
  root: {
    '&$expanded': {
      margin: 0,
    },
    borderTop: '0.5px solid #C0C0C0',
  },
  /* Styles applied to the root element if `expanded={true}`. */
  expanded: {},
}))(ExpansionPanel);

const StyledExpansionPanelSummary = withStyles({
  expandIcon: {
    order: -1,
    paddingRight: '20px',
  },
  root: {
    height: '40px !important',
    padding: '0px !important',
  },
})(ExpansionPanelSummary);

const mapStateToProps = (state) => {
  return {
    incomingRequest: state.http.incomingRequest,
  };
};

const mapDispatch = (dispatch) => {
  return {
    resetIncomingRequest: () => {
      dispatch({
        type: HttpExecutorActions.notifyIncomingRequest,
        payload: {
          incomingRequest: {
            status: IncomingRequestStatus.NORMAL,
          },
        },
      });
    },
  };
};

interface IRequestHistoryTabProps extends WithStyles<typeof styles> {
  incomingRequest: IIncomingRequest;
  resetIncomingRequest: () => void;
}

const RequestHistoryTabView: React.FC<IRequestHistoryTabProps> = ({
  classes,
  incomingRequest,
  resetIncomingRequest,
}) => {
  // requestLog maps a date (e.g. April 5th) to a list of request histories that were logged that day.
  // The list of request histories is sorted by timestamp.
  const [requestLog, setRequestLog] = React.useState(Map<string, List<IRequestHistory>>({}));
  const [searchText, setSearchText] = React.useState('');
  const [saveRequest, setSaveRequest] = React.useState(true);
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);

  // Query through localstorage and popluate RequestHistoryTab
  React.useEffect(() => {
    fetchFromLocalStorage();
  }, []);

  // When new request history is incoming, update RequestHistoryTab
  React.useEffect(() => {
    switch (incomingRequest.status) {
      case IncomingRequestStatus.ADD:
        addRequestLog();
        break;
      case IncomingRequestStatus.DELETE:
        deleteRequestLog(incomingRequest.requestID);
        break;
      case IncomingRequestStatus.CLEAR:
        clearRequestLog();
        break;
      default:
        break;
    }
    resetIncomingRequest();
  }, [incomingRequest.status]);

  const fetchFromLocalStorage = () => {
    // Group and sort logs by timestamp
    let newRequestLog = Map<string, List<IRequestHistory>>({});
    Object.keys(localStorage)
      .filter((key) => key.startsWith(REQUEST_HISTORY_IDENTIFIER))
      .sort((a, b) => compareByTimestamp(a.substr(14), b.substr(14)))
      .forEach((key) => {
        // Parse the timestamp from localStorage
        const requestID = new Date(key.substr(14));

        // Parse the request information from localStorage
        const newRequest: IRequestHistory = JSON.parse(localStorage.getItem(key));
        // Attach requestID as a unique idenitifier of each request,
        // where requestID represents the timestamp at which a request was logged
        newRequest.requestID = requestID;

        const dateID: string = getTimestampDate(requestID);
        const requestsGroup = getRequestsByDate(newRequestLog, dateID);
        newRequestLog = newRequestLog.set(dateID, requestsGroup.push(newRequest));
      });
    setRequestLog(newRequestLog);
  };

  const addRequestLog = () => {
    if (!saveRequest) {
      return;
    }
    // Get the current timestamp since new request is being logged
    const requestID = new Date();

    // Get the request information from HttpExecutorStore
    const requestToAdd: IRequestHistory = HttpExecutorStore.getState().http;
    // Attach requestID as a unique idenitifier of each request,
    // where requestID represents the timestamp at which a request was logged
    requestToAdd.requestID = requestID;

    // Store new request history in local storage
    localStorage.setItem(getLocalStorageKey(requestID), JSON.stringify(requestToAdd));

    // Update the component view in real-time, since we cannot listen to local storage's change
    // Since the new request call is the latest out of all the request histories, insert at 0th index
    const dateID = getTimestampDate(requestID);
    const requestsGroup = getRequestsByDate(requestLog, dateID);
    const newRequestLog = requestLog.set(dateID, requestsGroup.insert(0, requestToAdd));
    setRequestLog(newRequestLog);
  };

  const deleteRequestLog = (requestID: Date) => {
    if (!requestID) {
      return;
    }

    // Delete the specified request log from local storage
    localStorage.removeItem(getLocalStorageKey(requestID));

    // Delete the specified request log from local state
    const dateID = getTimestampDate(requestID);
    const requestsGroup = getRequestsByDate(requestLog, dateID);
    const requestToDelete = requestsGroup.findIndex((data) => data.requestID === requestID);
    const newRequestLog = requestLog.set(dateID, requestsGroup.delete(requestToDelete));
    setRequestLog(newRequestLog);
  };

  const clearRequestLog = () => {
    // Delete every request log from local storage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(REQUEST_HISTORY_IDENTIFIER)) {
        localStorage.removeItem(key);
      }
    });

    // Delete every request log from local state
    setRequestLog(Map({}));
  };

  const getTimestampDate = (timestamp: Date): string => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return timestamp.toLocaleDateString('en-US', options);
  };

  const getRequestsByDate = (
    log: Map<string, List<IRequestHistory>>,
    dateID: string
  ): List<IRequestHistory> => {
    return log.get(dateID) || List([]);
  };

  const getLocalStorageKey = (timestamp: Date): string => {
    return `${REQUEST_HISTORY_IDENTIFIER} ${timestamp.toLocaleString()}`;
  };

  const compareByTimestamp = (a: string, b: string) => {
    const timestampA = new Date(a);
    const timestampB = new Date(b);
    if (timestampA < timestampB) {
      return 1;
    } else if (timestampA > timestampB) {
      return -1;
    } else {
      return 0;
    }
  };

  const getFilteredRequestLogs = (requests: List<IRequestHistory>, query: string) => {
    return requests.filter((request) => request.path.includes(query));
  };

  return (
    <div className={classes.root} data-cy="request-history-tab">
      <RequestSearch searchText={searchText} setSearchText={setSearchText} />
      <div className={classes.requestLogManager}>
        <div className={classes.saveResponses}>
          <Switch
            checked={saveRequest}
            onChange={() => setSaveRequest(!saveRequest)}
            color="primary"
            name="checkedB"
            inputProps={{ 'aria-label': 'primary checkbox' }}
            data-cy="save-mode-btn"
          />
          Save responses
        </div>
        <Button
          onClick={() => setClearDialogOpen(true)}
          className={classes.clearAll}
          data-cy="clear-btn"
        >
          Clear
        </Button>
      </div>
      {requestLog
        .keySeq()
        .toArray()
        .sort((a: string, b: string) => compareByTimestamp(a, b))
        .map((dateID: string) => {
          const requests: List<IRequestHistory> = requestLog.get(dateID);
          const filteredRequests = getFilteredRequestLogs(requests, searchText);
          return (
            <If condition={filteredRequests.size > 0}>
              <StyledExpansionPanel key={dateID} defaultExpanded elevation={0}>
                <StyledExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>{dateID}</Typography>
                </StyledExpansionPanelSummary>
                <ExpansionPanelDetails className={classes.timestampGroup}>
                  {filteredRequests.map((request, requestIndex) => (
                    <RequestRow key={requestIndex} request={request} />
                  ))}
                </ExpansionPanelDetails>
              </StyledExpansionPanel>
            </If>
          );
        })}
      <ClearDialog open={clearDialogOpen} handleClose={() => setClearDialogOpen(false)} />
    </div>
  );
};

const RequestHistoryTab = withStyles(styles)(
  connect(mapStateToProps, mapDispatch)(RequestHistoryTabView)
);
export default RequestHistoryTab;
