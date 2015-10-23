/*
 * Copyright © 2015 Cask Data, Inc.
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

package co.cask.cdap.api.schedule;

import java.util.Objects;
import javax.annotation.Nullable;

/**
 * Defines requirements that must be satisfied at runtime in order for the scheduler to launch a run.
 *
 * Currently only contains the maximum number of concurrent runs. In the future, other checks may be added,
 * such as the amount of available memory in the YARN cluster.
 */
public class RunRequirements {
  public static final RunRequirements NONE = new RunRequirements(null);
  private final Integer concurrentProgramRunsThreshold;

  RunRequirements(Integer concurrentProgramRunsThreshold) {
    this.concurrentProgramRunsThreshold = concurrentProgramRunsThreshold;
  }

  /**
   * @return the threshold for number of concurrent program runs.
   *         The scheduler will skip the scheduled run if there are more than
   *         the threshold number of program runs in the RUNNING state.
   *         For example, if set to 0, the scheduled run will be skipped if that are any program runs
   *         in the RUNNING state. Returns null if there is no limit.
   */
  @Nullable
  public Integer getConcurrentProgramRunsThreshold() {
    return concurrentProgramRunsThreshold;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }

    RunRequirements that = (RunRequirements) o;
    return Objects.equals(concurrentProgramRunsThreshold, that.concurrentProgramRunsThreshold);
  }

  @Override
  public int hashCode() {
    return Objects.hash(concurrentProgramRunsThreshold);
  }
}
