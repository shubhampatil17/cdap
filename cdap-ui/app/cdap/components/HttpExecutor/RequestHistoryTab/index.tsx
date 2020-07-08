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

import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelActions from '@material-ui/core/ExpansionPanelActions';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import withStyles, { StyleRules, WithStyles } from '@material-ui/core/styles/withStyles';
import Typography from '@material-ui/core/Typography';
import classnames from 'classnames';
import { LEFT_PANEL_WIDTH } from 'components/HttpExecutor';
import HttpExecutorActions from 'components/HttpExecutor/store/HttpExecutorActions';
import HttpExecutorStore from 'components/HttpExecutor/store/HttpExecutorStore';
import { List, Map } from 'immutable';
import * as React from 'react';
import { connect } from 'react-redux';

const styles = (theme): StyleRules => {
  return {
    root: {
      borderRight: `1px solid ${theme.palette.grey[300]}`,
      height: '100%',
    },
    timestampGroup: {
      display: 'flex',
      flexFlow: 'column',
    },
    requestRow: {
      padding: '10px',
      lineHeight: '24px',
      display: 'grid',
      width: '100%',
      gridTemplateColumns: '50px 1fr',
      cursor: 'pointer',

      '&:hover': {
        backgroundColor: theme.palette.grey[700],
      },
    },
    requestMethod: {
      paddingLeft: '5px',
      color: theme.palette.white[50],
      width: '100%',
      height: '100%',
      fontWeight: 600,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      fontSize: '10px',
    },
    requestMethodText: {
      width: '100%',
      textAlign: 'left',
      alignSelf: 'center',
    },
    requestPath: {
      width: `${LEFT_PANEL_WIDTH / 1.5}px`,
      wordWrap: 'break-word',
      textAlign: 'left',
      textTransform: 'lowercase',
      fontSize: '10px',
      lineHeight: '1.3',
    },
    getMethod: {
      color: theme.palette.green[50],
    },
    postMethod: {
      color: theme.palette.orange[50],
    },
    putMethod: {
      color: theme.palette.yellow[50],
    },
    deleteMethod: {
      color: theme.palette.red[50],
    },
  };
};

const StyledExpansionPanel = withStyles(() => ({
  root: {
    '&$expanded': {
      margin: 0,
    },
    borderBottom: '1px solid #C0C0C0',
  },
  /* Styles applied to the root element if `expanded={true}`. */
  expanded: {},
}))(ExpansionPanel);

enum RequestMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

interface IRequestHistory {
  timestamp: Date;
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

interface IRequestHistoryTabProps extends WithStyles<typeof styles> {
  incomingRequest: boolean;
  onRequestClick: (request: IRequestHistory) => void;
  resetIncomingRequest: () => void;
}

const mapStateToProps = (state) => {
  return {
    incomingRequest: state.http.incomingRequest,
  };
};

const mapDispatch = (dispatch) => {
  return {
    onRequestClick: (request: IRequestHistory) => {
      dispatch({
        type: HttpExecutorActions.setRequestHistoryView,
        payload: request,
      });
    },
    resetIncomingRequest: () => {
      dispatch({
        type: HttpExecutorActions.notifyIncomingRequest,
        payload: {
          incomingRequest: false,
        },
      });
    },
  };
};

const RequestHistoryTabView: React.FC<IRequestHistoryTabProps> = ({
  classes,
  incomingRequest,
  onRequestClick,
  resetIncomingRequest,
}) => {
  const [requestLog, setRequestLog] = React.useState(
    Map<string, List<IRequestHistory>>({}) // maps timestamp date (e.g. April 5th) to a list of corresponding request histories
  );

  const convertDateToString = (date: Date) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  // Query through localstorage and popluate RequestHistoryTab
  React.useEffect(() => {
    // Group and sort logs by timestamp
    let newRequestLog = Map<string, any>({});
    Object.keys(localStorage)
      .filter((key) => key.startsWith('RequestHistory'))
      .sort((a, b) => {
        const timestampA = new Date(a.substr(14));
        const timestampB = new Date(b.substr(14));
        if (timestampA < timestampB) {
          return 1;
        } else if (timestampA > timestampB) {
          return -1;
        } else {
          return 0;
        }
      })
      .forEach((key) => {
        const timestamp = new Date(key.substr(14));
        const timestampInString = convertDateToString(timestamp);
        const newRequest = JSON.parse(localStorage.getItem(key));
        newRequest.timestamp = timestamp;

        const existingRequestHistory = newRequestLog.get(timestampInString) || List([]);
        newRequestLog = newRequestLog.set(
          timestampInString,
          existingRequestHistory.push(newRequest)
        );
      });
    setRequestLog(newRequestLog);
  }, []);

  // When new request history is incoming, update RequestHistoryTab
  React.useEffect(() => {
    if (!incomingRequest) {
      return;
    }
    const currentDate = new Date();
    const timestamp = `RequestHistory ${currentDate.toLocaleString()}`;
    const newRequest = HttpExecutorStore.getState().http;

    // Store new request history in local storage
    localStorage.setItem(timestamp, JSON.stringify(newRequest));

    // Update the component view in real-time, since we cannot listen to local storage's change
    // Since the new request call is the latest out of all the request histories, insert at 0th index
    const timestampInString = convertDateToString(currentDate);
    const existingRequestHistory = requestLog.get(timestampInString) || List([]);
    const newRequestLog = requestLog.set(
      timestampInString,
      existingRequestHistory.insert(0, newRequest)
    );
    setRequestLog(newRequestLog);

    resetIncomingRequest();
  }, [incomingRequest]);

  return (
    <div className={classes.root}>
      {requestLog.keySeq().map((timestamp) => {
        const requestHistories = requestLog.get(timestamp);
        return (
          <StyledExpansionPanel key={timestamp} defaultExpanded elevation={0}>
            <ExpansionPanelSummary classes={{ root: classes.root, expanded: classes.expanded }}>
              <Typography>{timestamp}</Typography>
            </ExpansionPanelSummary>
            <ExpansionPanelActions className={classes.timestampGroup}>
              {requestHistories.map((request, requestIndex) => {
                return (
                  <div
                    key={`request-${requestIndex}`}
                    className={classes.requestRow}
                    onClick={() => onRequestClick(request)}
                  >
                    <div
                      className={classnames(classes.requestMethod, {
                        [classes.getMethod]: request.method === RequestMethod.GET,
                        [classes.postMethod]: request.method === RequestMethod.POST,
                        [classes.deleteMethod]: request.method === RequestMethod.DELETE,
                        [classes.putMethod]: request.method === RequestMethod.PUT,
                      })}
                    >
                      <div className={classes.requestMethodText}>{request.method}</div>
                    </div>
                    <div className={classes.requestPath}>{request.path}</div>
                  </div>
                );
              })}
            </ExpansionPanelActions>
          </StyledExpansionPanel>
        );
      })}
    </div>
  );
};

const RequestHistoryTab = withStyles(styles)(
  connect(mapStateToProps, mapDispatch)(RequestHistoryTabView)
);
// const RequestHistoryTab = withStyles(styles)(RequestHistoryTabView);
export default RequestHistoryTab;
