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

import * as React from 'react';
import Select from 'components/AbstractWidget/FormInputs/Select';
import { SchemaEditor } from 'components/AbstractWidget/SchemaEditor';
import withStyles, { WithStyles, StyleRules } from '@material-ui/core/styles/withStyles';
import ThemeWrapper from 'components/ThemeWrapper';
import ee from 'event-emitter';
import { getDefaultEmptyAvroSchema } from 'components/AbstractWidget/SchemaEditor/SchemaConstants';
import PropTypes from 'prop-types';
import LoadingSVG from 'components/LoadingSVG';
import If from 'components/If';
import Textbox from 'components/AbstractWidget/FormInputs/TextBox';
import startCase from 'lodash/startCase';

const styles = (theme): StyleRules => {
  return {
    header: {
      display: 'grid',
      gridTemplateColumns: '75% 25%',
      alignItems: 'center',
      margin: '5px 0',
      paddingBottom: '5px',
      borderBottom: `1px solid ${theme.palette.grey[300]}`,
    },
    title: {
      fontWeight: 500,
    },
    actionsDropdown: {
      border: `1px solid ${theme.palette.grey[400]}`,
      borderRadius: '4px',
    },
    loadingContainer: {
      textAlign: 'center',
    },
    macroTextBox: {
      width: '100%',
      border: `1px solid ${theme.palette.grey[300]}`,
      borderRadius: '4px',
      padding: '0 5px',
    },
  };
};

enum SchemaActionsEnum {
  IMPORT = 'import',
  EXPORT = 'export',
  CLEAR = 'clear',
  MACRO = 'macro',
  EDITOR = 'editor',
  PROPAGATE = 'propagate',
}
enum IPluginSchemaEditorModes {
  Macro = 'macro',
  Editor = 'editor',
}
interface IActionsOptionsObj {
  disabled?: boolean;
  tooltip?: string;
  label: string;
  value: SchemaActionsEnum;
  onClick?: () => void;
}
interface IPluginSchema {
  name: string;
  schema: string;
}
type IActionsDropdownTooltip = Record<SchemaActionsEnum, IActionsOptionsObj>;
interface IPluginSchemaEditorState {
  schemas: IPluginSchema[];
  mode: IPluginSchemaEditorModes;
  loading: boolean;
}

interface IPluginSchemaEditorProps extends WithStyles<typeof styles> {
  actionsDropdownMap: IActionsDropdownTooltip;
  schemas: IPluginSchema[];
  onSchemaChange: (schemas: IPluginSchema[]) => void;
}

class PluginSchemaEditorBase extends React.Component<
  IPluginSchemaEditorProps,
  IPluginSchemaEditorState
> {
  private actions: IActionsOptionsObj[] = Object.values(this.props.actionsDropdownMap).map(
    (value) => value
  );

  public state = {
    schemas: this.props.schemas,
    loading: false,
    mode:
      this.props.schemas[0].schema.indexOf('${') !== -1
        ? IPluginSchemaEditorModes.Macro
        : IPluginSchemaEditorModes.Editor,
  };

  private ee = ee(ee);

  constructor(props) {
    super(props);
    this.ee.on('schema.import', this.onSchemaImport);
    this.ee.on('schema.export', this.onSchemaExport);
  }

  public componentWillReceiveProps(nextProps: IPluginSchemaEditorProps) {
    this.actions = Object.values(nextProps.actionsDropdownMap).map((value) => value);
  }

  public onSchemaExport = () => {
    const schemasToExport = this.props.schemas.map((schema) => {
      try {
        return {
          name: schema.name,
          schema: JSON.parse(schema.schema),
        };
      } catch (e) {
        return schema;
      }
    });
    const blob = new Blob([JSON.stringify(schemasToExport, null, 4)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const exportFileName = 'schema';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.json`;

    const clickHandler = (event) => {
      event.stopPropagation();
    };
    a.addEventListener('click', clickHandler, false);
    a.click();
  };

  private onSchemaImport = (schemas) => {
    if (this.state.mode === IPluginSchemaEditorModes.Macro) {
      return;
    }
    let importedSchemas = schemas;
    if (typeof schemas === 'string') {
      try {
        importedSchemas = JSON.parse(schemas);
      } catch (e) {
        return;
      }
    }
    if (!Array.isArray(importedSchemas)) {
      importedSchemas = [{ name: 'etlSchemaBody', schema: importedSchemas }];
    }
    const newSchemas = importedSchemas.map((schema) => {
      if (typeof schema.schema !== 'string') {
        return schema;
      }
      const s = { ...schema };
      try {
        s.schema = JSON.parse(schema.schema);
      } catch (e) {
        return schema;
      }
      return s;
    });
    this.setState({ schemas: newSchemas, loading: true }, () => {
      setTimeout(() => {
        this.setState({
          loading: false,
        });
        const schemasForPlugin = newSchemas.map((s) => {
          if (typeof s.schema !== 'string') {
            s.schema = JSON.stringify(s.schema);
          }
          return s;
        });
        this.props.onSchemaChange(schemasForPlugin);
      }, 1000);
    });
  };

  private onActionsHandler = (value) => {
    const specificAction = this.actions.find((action) => action.value === value);
    if (!specificAction) {
      return;
    }
    specificAction.onClick();
    if (value === SchemaActionsEnum.CLEAR) {
      specificAction.onClick();
      this.setState(
        {
          loading: true,
          schemas: [{ name: 'etlSchemaBody', schema: '' }],
        },
        () => {
          setTimeout(() => {
            this.setState({
              loading: false,
            });
          }, 1000);
        }
      );
    } else if (value === SchemaActionsEnum.MACRO) {
      const newState = {
        mode:
          this.state.mode === IPluginSchemaEditorModes.Editor
            ? IPluginSchemaEditorModes.Macro
            : IPluginSchemaEditorModes.Editor,
        schemas:
          this.state.mode === IPluginSchemaEditorModes.Editor
            ? [{ name: 'etlSchemaBody', schema: '${}' }]
            : [{ name: 'etlSchemaBody', schema: '' }],
      };
      this.setState(newState);
    }
  };

  public renderSchemaEditors = () => {
    if (this.state.loading || this.state.mode === IPluginSchemaEditorModes.Macro) {
      return null;
    }

    return (this.state.schemas || [])
      .map((s) => {
        const newSchema = {
          name: s.name,
          schema: s.schema,
        };
        if (typeof s.schema === 'string') {
          try {
            newSchema.schema = JSON.parse(s.schema);
          } catch (e) {
            return { ...getDefaultEmptyAvroSchema() };
          }
        }
        return newSchema;
      })
      .map((schema, i) => (
        <SchemaEditor
          schema={schema}
          onChange={({ avroSchema }) => {
            const newSchemas = [...this.props.schemas];
            newSchemas[i] = avroSchema;
            newSchemas[i].schema = JSON.stringify(newSchemas[i].schema);
            this.props.onSchemaChange(newSchemas);
          }}
        />
      ));
  };

  public renderMacroEditor = () => {
    if (this.state.mode === IPluginSchemaEditorModes.Editor) {
      return null;
    }
    const macro = this.state.schemas[0].schema;
    return (
      <Textbox
        value={macro}
        className={this.props.classes.macroTextBox}
        onChange={(value) => {
          const newSchemas = [{ name: 'etlSchemaBody', schema: value }];
          this.setState({
            schemas: newSchemas,
          });
          this.props.onSchemaChange(newSchemas);
        }}
      />
    );
  };

  public render() {
    const { classes } = this.props;
    return (
      <div>
        <div className={classes.header}>
          <div className={classes.title}>Output Schema</div>
          <Select
            classes={{ root: classes.actionsDropdown }}
            value={''}
            placeholder="Actions"
            onChange={this.onActionsHandler}
            widgetProps={{ options: this.actions }}
          />
        </div>
        <If condition={this.state.loading}>
          <div className={classes.loadingContainer}>
            <LoadingSVG />
          </div>
        </If>
        {this.renderSchemaEditors()}
        {this.renderMacroEditor()}
      </div>
    );
  }
}
const StyledPluginSchemaEditor = withStyles(styles)(PluginSchemaEditorBase);

const PluginSchemaEditor = (props) => {
  return (
    <ThemeWrapper>
      <StyledPluginSchemaEditor {...props} />
    </ThemeWrapper>
  );
};
(PluginSchemaEditor as any).propTypes = {
  schemas: PropTypes.array,
  onSchemaChange: PropTypes.func,
  disabled: PropTypes.func,
  actionsDropdownMap: PropTypes.array,
};
export { PluginSchemaEditor };
