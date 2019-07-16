/*
 * Copyright © 2019 Cask Data, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

import React from 'react';
import PropTypes from 'prop-types';
import isEqual from 'lodash/isEqual';
import classnames from 'classnames';

import withStyles, { WithStyles } from '@material-ui/core/styles/withStyles';
import Button from '@material-ui/core/Button';

import ThemeWrapper from 'components/ThemeWrapper';
import SchemaContainer from 'components/AbstractWidget/SqlSelectorWidget/SchemaContainer';
import If from 'components/If';

export const styles = () => {
  return {
    root: {
      padding: '4px',
      display: 'flex',
      'flex-direction': 'column',
    },
    buttonContainer: {
      display: 'flex',
      justifyContent: 'flex-end',
      '> button': {
        marginLeft: '5px',
      },
    },
    errorMessage: {
      margin: '5px',
    },
    emptyMessage: {
      margin: '0px',
    },
  };
};

interface ISqlSelectorWidgetProps extends WithStyles<typeof styles> {
  value: string;
  inputSchema: any;
  onChange: (arg0: any) => void;
}

export interface IFieldSchema {
  selected: boolean;
  name: string;
  alias: string;
}
export interface IParsedInputSchema {
  key: string;
  name: string;
  expanded: boolean;
  schema: IFieldSchema[];
}
interface ISqlSelectorWidgetState {
  expandAll: boolean;
  errors: { stageCount: object; message: string; exist: boolean };
  parsedInputSchemas: IParsedInputSchema[];
  aliases: object;
  modelCopy: any;
}

class SqlSelectorWidgetView extends React.PureComponent<
  ISqlSelectorWidgetProps,
  ISqlSelectorWidgetState
> {
  public state = {
    expandAll: false,
    errors: {
      stageCount: {},
      message: 'Please create one or more aliases for duplicate field names.',
      exist: false,
    },
    parsedInputSchemas: null,
    aliases: null,
    modelCopy: null,
  };

  public componentDidMount() {
    this.setState({ modelCopy: this.props.value });
    this.init(null);
  }

  public toggleExpandAll = () => {
    this.state.expandAll ? this.collapseAllStages() : this.expandAllStages();
    this.setState({ expandAll: !this.state.expandAll });
  };

  public resetAll = () => {
    this.setState(
      {
        expandAll: false,
        parsedInputSchemas: null,
      },
      () => {
        this.init(this.state.modelCopy);
      }
    );
  };

  public expandStage = (curStage) => {
    this.setState(
      {
        parsedInputSchemas: this.state.parsedInputSchemas.map((stage) => {
          if (isEqual(stage, curStage)) {
            stage.expanded = !curStage.expanded;
          }
          return stage;
        }),
      },
      () => {
        // If all of the expansion panels are individually opened or closed,
        // this will change button expand all button text.
        let expandedCount = 0;
        this.state.parsedInputSchemas.forEach((stage) => {
          if (stage.expanded) {
            expandedCount++;
          }
        });
        if (expandedCount === this.state.parsedInputSchemas.length) {
          this.setState({ expandAll: true });
        } else if (expandedCount === 0) {
          this.setState({ expandAll: false });
        }
      }
    );
  };

  public expandAllStages = () => {
    this.setState({
      parsedInputSchemas: this.state.parsedInputSchemas.map((stage) => {
        stage.expanded = true;
        return stage;
      }),
    });
  };

  public collapseAllStages = () => {
    this.setState({
      parsedInputSchemas: this.state.parsedInputSchemas.map((stage) => {
        stage.expanded = false;
        return stage;
      }),
    });
  };

  public getStageError = () => {
    const stageCount = {};
    this.state.parsedInputSchemas.forEach((input) => {
      input.schema.forEach((field) => {
        if (this.state.aliases[field.alias] > 1) {
          if (!stageCount[input.name]) {
            stageCount[input.name] = 1;
          } else {
            stageCount[input.name]++;
          }
        }
      });
    });
    this.setState({
      errors: {
        ...this.state.errors,
        stageCount,
      },
    });
  };

  public formatOutput = () => {
    const outputArr = [];
    const tempAliases = {};
    let errorExists = false;
    this.state.parsedInputSchemas.forEach((input) => {
      input.schema.forEach((field) => {
        if (!field.selected) {
          return;
        }
        const outputField = `${input.name}.${field.name}${field.alias ? ` as ${field.alias}` : ''}`;
        if (!tempAliases[field.alias]) {
          tempAliases[field.alias] = 1;
        } else {
          tempAliases[field.alias]++;
          errorExists = true;
        }
        outputArr.push(outputField);
      });
    });
    this.setState(
      {
        errors: {
          stageCount: this.state.errors.stageCount,
          message: this.state.errors.message,
          exist: errorExists,
        },
        aliases: tempAliases,
      },
      () => {
        this.getStageError();
      }
    );
    this.props.onChange(outputArr.join(','));
  };

  public init = (inputModel) => {
    const initialModel = {};
    const parsedInputSchemas: IParsedInputSchema[] = [];
    if (inputModel) {
      inputModel.split(',').forEach((entry) => {
        const split = entry.split(' as ');
        const fieldInfo = split[0].split('.');
        if (!initialModel[fieldInfo[0]]) {
          initialModel[fieldInfo[0]] = {};
        }
        initialModel[fieldInfo[0]][fieldInfo[1]] = split[1] ? split[1] : true;
      });
    }
    this.props.inputSchema.forEach((input, i) => {
      let schema;
      try {
        schema = JSON.parse(input.schema);
      } catch (e) {
        schema = {
          fields: [],
        };
      }
      schema = schema.fields.map((field) => {
        if (initialModel[input.name] && initialModel[input.name][field.name]) {
          field.selected = true;
          field.alias =
            initialModel[input.name][field.name] === true
              ? ''
              : initialModel[input.name][field.name];
        } else {
          field.selected = inputModel ? false : true;
          field.alias = field.name;
        }

        return field;
      });
      parsedInputSchemas.push({
        key: `${i}-${input.name}`,
        name: input.name,
        schema,
        expanded: false,
      });
    });
    this.setState({ parsedInputSchemas }, () => {
      this.formatOutput();
    });
  };

  public onSchemaChange = (newSchema) => {
    const newIpSchema = this.state.parsedInputSchemas.map((schema) => {
      if (schema.key === newSchema.key) {
        return newSchema;
      }
      return schema;
    });
    this.setState({ parsedInputSchemas: newIpSchema }, () => {
      this.formatOutput();
    });
  };

  public render() {
    const { classes } = this.props;
    return (
      <div className={classes.root}>
        <If condition={this.state.parsedInputSchemas && this.state.parsedInputSchemas.length > 0}>
          <div className={classes.buttonContainer}>
            <Button variant="outlined" size="small" onClick={this.toggleExpandAll}>
              {this.state.expandAll ? 'Collapse All' : 'Expand All'}
            </Button>
            <Button size="small" onClick={this.resetAll}>
              Reset All
            </Button>
          </div>
        </If>
        <If condition={this.state.errors.exist}>
          <div className={classnames('text-danger', classes.errorMessage)}>
            {this.state.errors.message}
          </div>
        </If>
        {this.state.parsedInputSchemas &&
          this.state.parsedInputSchemas.map((stage) => {
            return (
              <SchemaContainer
                onExpandClick={this.expandStage}
                onSchemaChange={this.onSchemaChange}
                stage={stage}
                aliases={this.state.aliases}
                errorCount={
                  this.state.errors.stageCount && this.state.errors.stageCount[stage.name]
                }
              />
            );
          })}
        <If condition={this.state.parsedInputSchemas && this.state.parsedInputSchemas.length === 0}>
          <h4 className={classes.emptyMessage}>No input stages</h4>
        </If>
      </div>
    );
  }
}

const SqlSelectorWidget = withStyles(styles)(SqlSelectorWidgetView);

export default function StyledSqlSelectorWidget(props) {
  return (
    <ThemeWrapper>
      <SqlSelectorWidget {...props} />
    </ThemeWrapper>
  );
}

(StyledSqlSelectorWidget as any).propTypes = {
  value: PropTypes.string,
  inputSchema: PropTypes.object,
  onChange: PropTypes.func,
};