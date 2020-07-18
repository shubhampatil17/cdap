/*
 * Copyright © 2019 Cask Data, Inc.
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
import React from 'react';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import InputBase from '@material-ui/core/InputBase';
import { IWidgetProps } from 'components/AbstractWidget';
import { objectQuery } from 'services/helpers';
import { WIDGET_PROPTYPES } from 'components/AbstractWidget/constants';
import withStyles from '@material-ui/core/styles/withStyles';
import { blue } from 'components/ThemeWrapper/colors';
import { isNilOrEmptyString } from 'services/helpers';
import Tooltip from '@material-ui/core/Tooltip';

const CustomTooltip = withStyles((theme) => {
  return {
    tooltip: {
      backgroundColor: theme.palette.grey[200],
      color: 'white',
      fontSize: '12px',
      wordBreak: 'break-word',
    },
  };
})(Tooltip);

const CustomizedInput = withStyles(() => {
  return {
    input: {
      padding: '7px 18px 7px 12px',
      '&:focus': {
        backgroundColor: 'transparent',
        outline: `1px solid ${blue[100]}`,
      },
    },
  };
})(InputBase);

const DenseMenuItem = withStyles(() => {
  return {
    root: {
      minHeight: 'unset',
      paddingTop: '3px',
      paddingBottom: '3px',
    },
  };
})(MenuItem);

const InlineSelect = withStyles(() => {
  return {
    root: {
      display: 'inline-block',
    },
  };
})(Select);

interface ISelectOptions {
  value: string | number; // We need to expand this when we have complex use cases
  label: string;
}

interface ISelectWidgetProps {
  options: ISelectOptions[] | string[] | number[];
  dense?: boolean;
  inline?: boolean;
}

interface ISelectProps extends IWidgetProps<ISelectWidgetProps> {
  placeholder?: string;
  inputRef?: (ref: React.ReactNode) => void;
  classes?: any;
  onOpen?: (e) => void;
}

const CustomSelect: React.FC<ISelectProps> = ({
  value,
  onChange,
  widgetProps,
  disabled,
  dataCy,
  inputRef,
  placeholder,
  ...restProps
}: ISelectProps) => {
  const onChangeHandler = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const v = event.target.value;
    if (typeof onChange === 'function') {
      onChange(v);
    }
  };

  const options = objectQuery(widgetProps, 'options') || objectQuery(widgetProps, 'values') || [];
  const dense = objectQuery(widgetProps, 'dense') || false;
  const inline = objectQuery(widgetProps, 'inline') || false;
  const OptionItem = dense ? DenseMenuItem : MenuItem;
  const SelectComponent = inline ? InlineSelect : Select;
  let optionValues = options.map((opt) => {
    return ['string', 'number'].indexOf(typeof opt) !== -1 ? { value: opt, label: opt } : opt;
  });
  if (!isNilOrEmptyString(placeholder)) {
    optionValues = [{ placeholder, value: '', label: placeholder }, ...optionValues];
  }

  return (
    <SelectComponent
      fullWidth
      value={value}
      onChange={onChangeHandler}
      input={<CustomizedInput />}
      readOnly={disabled}
      inputProps={{
        'data-cy': dataCy,
      }}
      MenuProps={{
        getContentAnchorEl: null,
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'left',
        },
      }}
      displayEmpty={!isNilOrEmptyString(placeholder)}
      inputRef={inputRef}
      {...restProps}
    >
      {optionValues.map((opt) => {
        const option = (
          <OptionItem
            value={opt.value}
            key={opt.value}
            disabled={opt.disabled || !isNilOrEmptyString(opt.placeholder)}
          >
            {opt.label}
          </OptionItem>
        );
        if (opt.tooltip) {
          return (
            <CustomTooltip title={opt.tooltip} placement={opt.toolipPlacement || 'left'}>
              <span>{option}</span>
            </CustomTooltip>
          );
        }
        return option;
      })}
    </SelectComponent>
  );
};

(CustomSelect as any).propTypes = WIDGET_PROPTYPES;

export default CustomSelect;
