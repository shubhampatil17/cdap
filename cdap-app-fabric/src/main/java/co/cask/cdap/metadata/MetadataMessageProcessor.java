/*
 * Copyright © 2018 Cask Data, Inc.
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

package co.cask.cdap.metadata;


import co.cask.cdap.data2.metadata.writer.MetadataMessage;

/**
 * Interface for metadata message processor
 */
public interface MetadataMessageProcessor {

  /**
   * Processes one {@link MetadataMessage}.
   */
  void processMessage(MetadataMessage message);

  /**
   * Determine if processing this message takes a long time
   *
   * @param message the message to be processed
   * @return a boolean variable which indicates if the processing time is long
   */
  default boolean isTimeConsumingMessage(MetadataMessage message) {
    return false;
  }
}