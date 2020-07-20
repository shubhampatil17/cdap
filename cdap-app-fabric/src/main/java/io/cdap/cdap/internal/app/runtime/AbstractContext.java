/*
 * Copyright © 2014-2019 Cask Data, Inc.
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

package io.cdap.cdap.internal.app.runtime;

import com.google.common.base.Strings;
import com.google.common.collect.ImmutableSet;
import com.google.common.collect.Maps;
import com.google.common.util.concurrent.UncheckedExecutionException;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import io.cdap.cdap.api.Admin;
import io.cdap.cdap.api.ProgramLifecycle;
import io.cdap.cdap.api.RuntimeContext;
import io.cdap.cdap.api.SchedulableProgramContext;
import io.cdap.cdap.api.Transactional;
import io.cdap.cdap.api.TxRunnable;
import io.cdap.cdap.api.annotation.TransactionControl;
import io.cdap.cdap.api.app.ApplicationSpecification;
import io.cdap.cdap.api.common.Bytes;
import io.cdap.cdap.api.common.RuntimeArguments;
import io.cdap.cdap.api.data.DatasetContext;
import io.cdap.cdap.api.data.DatasetInstantiationException;
import io.cdap.cdap.api.dataset.Dataset;
import io.cdap.cdap.api.dataset.lib.PartitionKey;
import io.cdap.cdap.api.dataset.lib.partitioned.PartitionKeyCodec;
import io.cdap.cdap.api.lineage.field.LineageRecorder;
import io.cdap.cdap.api.lineage.field.Operation;
import io.cdap.cdap.api.macro.MacroEvaluator;
import io.cdap.cdap.api.messaging.MessageFetcher;
import io.cdap.cdap.api.messaging.MessagePublisher;
import io.cdap.cdap.api.messaging.MessagingContext;
import io.cdap.cdap.api.messaging.TopicNotFoundException;
import io.cdap.cdap.api.metadata.Metadata;
import io.cdap.cdap.api.metadata.MetadataEntity;
import io.cdap.cdap.api.metadata.MetadataException;
import io.cdap.cdap.api.metadata.MetadataReader;
import io.cdap.cdap.api.metadata.MetadataScope;
import io.cdap.cdap.api.metadata.MetadataWriter;
import io.cdap.cdap.api.metrics.Metrics;
import io.cdap.cdap.api.metrics.MetricsCollectionService;
import io.cdap.cdap.api.metrics.MetricsContext;
import io.cdap.cdap.api.metrics.NoopMetricsContext;
import io.cdap.cdap.api.plugin.PluginContext;
import io.cdap.cdap.api.plugin.PluginProperties;
import io.cdap.cdap.api.preview.DataTracer;
import io.cdap.cdap.api.schedule.TriggeringScheduleInfo;
import io.cdap.cdap.api.security.store.SecureStore;
import io.cdap.cdap.api.security.store.SecureStoreData;
import io.cdap.cdap.api.security.store.SecureStoreManager;
import io.cdap.cdap.api.security.store.SecureStoreMetadata;
import io.cdap.cdap.app.metrics.ProgramUserMetrics;
import io.cdap.cdap.app.program.Program;
import io.cdap.cdap.app.runtime.ProgramOptions;
import io.cdap.cdap.app.services.AbstractServiceDiscoverer;
import io.cdap.cdap.common.app.RunIds;
import io.cdap.cdap.common.conf.CConfiguration;
import io.cdap.cdap.common.conf.Constants;
import io.cdap.cdap.common.lang.ClassLoaders;
import io.cdap.cdap.common.lang.CombineClassLoader;
import io.cdap.cdap.common.logging.LoggingContext;
import io.cdap.cdap.common.metrics.NoOpMetricsCollectionService;
import io.cdap.cdap.common.namespace.NamespaceQueryAdmin;
import io.cdap.cdap.common.service.Retries;
import io.cdap.cdap.common.service.RetryStrategy;
import io.cdap.cdap.data.LineageDatasetContext;
import io.cdap.cdap.data.RuntimeProgramContext;
import io.cdap.cdap.data.RuntimeProgramContextAware;
import io.cdap.cdap.data.dataset.SystemDatasetInstantiator;
import io.cdap.cdap.data2.dataset2.DatasetFramework;
import io.cdap.cdap.data2.dataset2.DynamicDatasetCache;
import io.cdap.cdap.data2.dataset2.MultiThreadDatasetCache;
import io.cdap.cdap.data2.dataset2.SingleThreadDatasetCache;
import io.cdap.cdap.data2.metadata.lineage.AccessType;
import io.cdap.cdap.data2.metadata.lineage.field.FieldLineageInfo;
import io.cdap.cdap.data2.metadata.writer.FieldLineageWriter;
import io.cdap.cdap.data2.metadata.writer.MetadataOperation;
import io.cdap.cdap.data2.metadata.writer.MetadataPublisher;
import io.cdap.cdap.data2.transaction.RetryingShortTransactionSystemClient;
import io.cdap.cdap.data2.transaction.Transactions;
import io.cdap.cdap.internal.app.preview.DataTracerFactoryProvider;
import io.cdap.cdap.internal.app.program.ProgramTypeMetricTag;
import io.cdap.cdap.internal.app.runtime.plugin.PluginClassLoaders;
import io.cdap.cdap.internal.app.runtime.plugin.PluginInstantiator;
import io.cdap.cdap.internal.app.runtime.schedule.TriggeringScheduleInfoAdapter;
import io.cdap.cdap.logging.context.LoggingContextHelper;
import io.cdap.cdap.messaging.MessagingService;
import io.cdap.cdap.messaging.context.BasicMessagingAdmin;
import io.cdap.cdap.messaging.context.MultiThreadMessagingContext;
import io.cdap.cdap.proto.Notification;
import io.cdap.cdap.proto.id.ApplicationId;
import io.cdap.cdap.proto.id.ArtifactId;
import io.cdap.cdap.proto.id.DatasetId;
import io.cdap.cdap.proto.id.EntityId;
import io.cdap.cdap.proto.id.KerberosPrincipalId;
import io.cdap.cdap.proto.id.NamespaceId;
import io.cdap.cdap.proto.id.NamespacedEntityId;
import io.cdap.cdap.proto.id.ProgramId;
import io.cdap.cdap.proto.id.ProgramRunId;
import io.cdap.cdap.proto.id.TopicId;
import org.apache.tephra.RetryStrategies;
import org.apache.tephra.TransactionConflictException;
import org.apache.tephra.TransactionFailureException;
import org.apache.tephra.TransactionSystemClient;
import org.apache.twill.api.RunId;
import org.apache.twill.discovery.DiscoveryServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Closeable;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import javax.annotation.Nullable;

/**
 * Base class for program runtime context
 */
public abstract class AbstractContext extends AbstractServiceDiscoverer
  implements SecureStore, LineageDatasetContext, Transactional, SchedulableProgramContext, RuntimeContext,
  PluginContext, MessagingContext, LineageRecorder, MetadataReader, MetadataWriter, Closeable {

  private static final Logger LOG = LoggerFactory.getLogger(AbstractContext.class);
  private static final Gson GSON = TriggeringScheduleInfoAdapter.addTypeAdapters(new GsonBuilder())
    .registerTypeAdapter(PartitionKey.class, new PartitionKeyCodec())
    .create();

  private final CConfiguration cConf;
  private final ArtifactId artifactId;
  private final Program program;
  private final ProgramOptions programOptions;
  private final ProgramRunId programRunId;
  private final Iterable<? extends EntityId> owners;
  @Nullable
  private final TriggeringScheduleInfo triggeringScheduleInfo;
  private final Map<String, String> runtimeArguments;
  private final Metrics userMetrics;
  private final MetricsContext programMetrics;
  private final DiscoveryServiceClient discoveryServiceClient;
  private final PluginInstantiator pluginInstantiator;
  private final PluginContext pluginContext;
  private final Admin admin;
  private final long logicalStartTime;
  private final SecureStore secureStore;
  private final Transactional transactional;
  private final int defaultTxTimeout;
  private final MessagingService messagingService;
  private final MultiThreadMessagingContext messagingContext;
  private final MetadataReader metadataReader;
  private final MetadataPublisher metadataPublisher;
  private final Set<Operation> fieldLineageOperations;
  private final LoggingContext loggingContext;
  private final FieldLineageWriter fieldLineageWriter;
  private volatile ClassLoader programInvocationClassLoader;
  protected final DynamicDatasetCache datasetCache;
  protected final RetryStrategy retryStrategy;

  /**
   * Constructs a context. To have plugin support, the {@code pluginInstantiator} must not be null.
   */
  protected AbstractContext(Program program, ProgramOptions programOptions, CConfiguration cConf,
                            Set<String> datasets, DatasetFramework dsFramework, TransactionSystemClient txClient,
                            DiscoveryServiceClient discoveryServiceClient, boolean multiThreaded,
                            @Nullable MetricsCollectionService metricsService, Map<String, String> metricsTags,
                            SecureStore secureStore, SecureStoreManager secureStoreManager,
                            MessagingService messagingService,
                            @Nullable PluginInstantiator pluginInstantiator,
                            MetadataReader metadataReader, MetadataPublisher metadataPublisher,
                            NamespaceQueryAdmin namespaceQueryAdmin, FieldLineageWriter fieldLineageWriter) {
    super(program.getId());

    this.artifactId = ProgramRunners.getArtifactId(programOptions);
    this.program = program;
    this.programOptions = programOptions;
    this.cConf = cConf;
    this.programRunId = program.getId().run(ProgramRunners.getRunId(programOptions));
    this.triggeringScheduleInfo = getTriggeringScheduleInfo(programOptions);
    this.discoveryServiceClient = discoveryServiceClient;
    this.owners = createOwners(program.getId());

    Map<String, String> runtimeArgs = new HashMap<>(programOptions.getUserArguments().asMap());
    this.logicalStartTime = ProgramRunners.updateLogicalStartTime(runtimeArgs);
    this.runtimeArguments = Collections.unmodifiableMap(runtimeArgs);

    this.programMetrics = createProgramMetrics(programRunId, getMetricsService(cConf, metricsService, runtimeArgs),
                                               metricsTags);
    this.userMetrics = new ProgramUserMetrics(programMetrics);
    this.retryStrategy = SystemArguments.getRetryStrategy(programOptions.getUserArguments().asMap(),
                                                          program.getType(),
                                                          cConf);
    this.messagingService = messagingService;
    this.messagingContext = new MultiThreadMessagingContext(messagingService);
    this.fieldLineageWriter = fieldLineageWriter;

    // Creating the DynamicDatasetCache
    Map<String, Map<String, String>> staticDatasets = new HashMap<>();
    for (String name : datasets) {
      staticDatasets.put(name, runtimeArgs);
    }
    SystemDatasetInstantiator instantiator =
      new SystemDatasetInstantiator(dsFramework, program.getClassLoader(), owners);

    TransactionSystemClient retryingTxClient = new RetryingShortTransactionSystemClient(txClient, retryStrategy);
    this.datasetCache = multiThreaded
      ? new MultiThreadDatasetCache(instantiator, retryingTxClient, program.getId().getNamespaceId(),
                                    runtimeArgs, programMetrics, staticDatasets, messagingContext)
      : new SingleThreadDatasetCache(instantiator, retryingTxClient, program.getId().getNamespaceId(),
                                     runtimeArgs, programMetrics, staticDatasets);
    if (!multiThreaded) {
      datasetCache.addExtraTransactionAware(messagingContext);
    }

    this.pluginInstantiator = pluginInstantiator;
    this.pluginContext = new DefaultPluginContext(pluginInstantiator, program.getId(),
                                                  program.getApplicationSpecification().getPlugins());

    KerberosPrincipalId principalId = ProgramRunners.getApplicationPrincipal(programOptions);
    this.admin = new DefaultAdmin(dsFramework, program.getId().getNamespaceId(), secureStoreManager,
                                  new BasicMessagingAdmin(messagingService, program.getId().getNamespaceId()),
                                  retryStrategy, principalId, namespaceQueryAdmin);
    this.secureStore = secureStore;
    this.defaultTxTimeout = determineTransactionTimeout(cConf);
    this.transactional = Transactions.createTransactional(getDatasetCache(), defaultTxTimeout);
    this.metadataReader = metadataReader;
    this.metadataPublisher = metadataPublisher;
    this.fieldLineageOperations = new HashSet<>();
    this.loggingContext = LoggingContextHelper.getLoggingContextWithRunId(program.getId().run(getRunId()),
                                                                          programOptions.getArguments().asMap());
  }

  private MetricsCollectionService getMetricsService(CConfiguration cConf, MetricsCollectionService metricsService,
                                                     Map<String, String> runtimeArgs) {
    boolean  emitMetrics =
      SystemArguments.isProgramMetricsEnabled(runtimeArgs,
                                              cConf.getBoolean(Constants.Metrics.PROGRAM_METRICS_ENABLED));
    return emitMetrics ? metricsService : new NoOpMetricsCollectionService();
  }

  @Nullable
  private TriggeringScheduleInfo getTriggeringScheduleInfo(ProgramOptions programOptions) {
    String scheduleInfoString =
      programOptions.getArguments().getOption(ProgramOptionConstants.TRIGGERING_SCHEDULE_INFO);
    return scheduleInfoString == null ? null : GSON.fromJson(scheduleInfoString, TriggeringScheduleInfo.class);
  }

  /**
   * Be default, this parses runtime argument "system.tx.timeout". Some program types may override this,
   * for example, in a flowlet, the more specific "flowlet.[name].system.tx.timeout" would prevail.
   *
   * @return the default transaction timeout, if specified in the runtime arguments. Otherwise returns the
   *         default transaction timeout from the cConf.
   */
  private int determineTransactionTimeout(CConfiguration cConf) {
    return SystemArguments.getTransactionTimeout(getRuntimeArguments(), cConf);
  }

  private Iterable<? extends EntityId> createOwners(ProgramId programId) {
    return Collections.singletonList(programId);
  }

  /**
   * Creates a {@link MetricsContext} for metrics emission of the program represented by this context.
   *
   * @param programRunId the {@link ProgramRunId} of the current execution
   * @param metricsService the underlying service for metrics publishing; or {@code null} to suppress metrics publishing
   * @param metricsTags a set of extra tags to be used for creating the {@link MetricsContext}
   * @return a {@link MetricsContext} for emitting metrics for the current program context.
   */
  private MetricsContext createProgramMetrics(ProgramRunId programRunId,
                                              @Nullable MetricsCollectionService metricsService,
                                              Map<String, String> metricsTags) {
    Map<String, String> tags = Maps.newHashMap(metricsTags);
    tags.put(Constants.Metrics.Tag.NAMESPACE, programRunId.getNamespace());
    tags.put(Constants.Metrics.Tag.APP, programRunId.getApplication());
    tags.put(ProgramTypeMetricTag.getTagName(programRunId.getType()), programRunId.getProgram());
    tags.put(Constants.Metrics.Tag.RUN_ID, programRunId.getRun());

    return metricsService == null ? new NoopMetricsContext(tags) : metricsService.getContext(tags);
  }

  /**
   * Returns the component Id or {@code null} if there is no component id for this runtime context.
   */
  @Nullable
  protected NamespacedEntityId getComponentId() {
    return null;
  }

  /**
   * Returns the {@link LoggingContext} for the program.
   */
  public LoggingContext getLoggingContext() {
    return loggingContext;
  }

  /**
   * @return the default transaction timeout.
   */
  public int getDefaultTxTimeout() {
    return defaultTxTimeout;
  }

  /**
   * Returns a list of ID who owns this program context.
   */
  public Iterable<? extends EntityId> getOwners() {
    return owners;
  }

  /**
   * Returns a {@link Metrics} to be used inside user program.
   */
  public Metrics getMetrics() {
    return userMetrics;
  }

  @Override
  public ApplicationSpecification getApplicationSpecification() {
    return program.getApplicationSpecification();
  }

  @Override
  public String getNamespace() {
    return program.getNamespaceId();
  }

  /**
   * Returns the {@link PluginInstantiator} used by this context or {@code null} if there is no plugin support.
   */
  @Nullable
  public PluginInstantiator getPluginInstantiator() {
    return pluginInstantiator;
  }

  @Override
  public String toString() {
    return String.format("namespaceId=%s, applicationId=%s, program=%s, runid=%s",
                         getNamespaceId(), getApplicationId(), getProgramName(), programRunId.getRun());
  }

  public MetricsContext getProgramMetrics() {
    return programMetrics;
  }

  public DynamicDatasetCache getDatasetCache() {
    return datasetCache;
  }

  @Override
  public <T extends Dataset> T getDataset(String name) throws DatasetInstantiationException {
    return getDataset(name, RuntimeArguments.NO_ARGUMENTS);
  }

  @Override
  public <T extends Dataset> T getDataset(String namespace, String name) throws DatasetInstantiationException {
    return getDataset(namespace, name, RuntimeArguments.NO_ARGUMENTS);
  }

  @Override
  public <T extends Dataset> T getDataset(String name, Map<String, String> arguments)
    throws DatasetInstantiationException {
    return getDataset(name, arguments, AccessType.UNKNOWN);
  }

  @Override
  public <T extends Dataset> T getDataset(String namespace, String name, Map<String, String> arguments)
    throws DatasetInstantiationException {
    return getDataset(namespace, name, arguments, AccessType.UNKNOWN);
  }

  @Override
  public <T extends Dataset> T getDataset(final String name, final Map<String, String> arguments,
                                          final AccessType accessType) throws DatasetInstantiationException {
    return getDataset(programRunId.getNamespace(), name, arguments, accessType);
  }

  @Override
  public <T extends Dataset> T getDataset(final String namespace, final String name,
                                          final Map<String, String> arguments,
                                          final AccessType accessType) throws DatasetInstantiationException {
    return Retries.callWithRetries(new Retries.Callable<T, DatasetInstantiationException>() {
      @Override
      public T call() throws DatasetInstantiationException {
        T dataset = datasetCache.getDataset(namespace, name, arguments, accessType);
        if (dataset instanceof RuntimeProgramContextAware) {
          DatasetId datasetId = new NamespaceId(namespace).dataset(name);
          ((RuntimeProgramContextAware) dataset).setContext(createRuntimeProgramContext(datasetId));
        }
        return dataset;
      }
    }, retryStrategy);
  }

  @Override
  public void releaseDataset(Dataset dataset) {
    datasetCache.releaseDataset(dataset);
  }

  @Override
  public void discardDataset(Dataset dataset) {
    datasetCache.discardDataset(dataset);
  }

  public String getNamespaceId() {
    return program.getNamespaceId();
  }

  public String getApplicationId() {
    return program.getApplicationId();
  }

  public String getProgramName() {
    return program.getName();
  }

  /**
   * Returns the {@link ArtifactId} of the artifact that contains the program.
   */
  public ArtifactId getArtifactId() {
    return artifactId;
  }

  public Program getProgram() {
    return program;
  }

  @Override
  public String getClusterName() {
    return programOptions.getArguments().getOption(Constants.CLUSTER_NAME);
  }

  @Override
  public RunId getRunId() {
    return RunIds.fromString(programRunId.getRun());
  }

  @Override
  public Map<String, String> getRuntimeArguments() {
    return runtimeArguments;
  }

  public long getLogicalStartTime() {
    return logicalStartTime;
  }

  /**
   * Returns the {@link ProgramRunId} of the running program.
   */
  public ProgramRunId getProgramRunId() {
    return programRunId;
  }

  /**
   * Release all resources held by this context, for example, datasets. Subclasses should override this
   * method to release additional resources.
   */
  @Override
  public void close() {
    datasetCache.close();
  }

  /**
   * Returns the {@link ProgramOptions} for the program execution that this context represents.
   */
  public ProgramOptions getProgramOptions() {
    return programOptions;
  }

  @Override
  public DiscoveryServiceClient getDiscoveryServiceClient() {
    return discoveryServiceClient;
  }

  @Override
  public PluginProperties getPluginProperties(String pluginId) {
    return pluginContext.getPluginProperties(pluginId);
  }

  @Override
  public PluginProperties getPluginProperties(String pluginId, MacroEvaluator evaluator) {
    return pluginContext.getPluginProperties(pluginId, evaluator);
  }

  @Override
  public <T> Class<T> loadPluginClass(String pluginId) {
    return pluginContext.loadPluginClass(pluginId);
  }

  @Override
  public <T> T newPluginInstance(String pluginId) throws InstantiationException {
    return pluginContext.newPluginInstance(pluginId);
  }

  @Override
  public <T> T newPluginInstance(String pluginId, MacroEvaluator evaluator) throws InstantiationException {
    return pluginContext.newPluginInstance(pluginId, evaluator);
  }

  @Override
  public Admin getAdmin() {
    return admin;
  }

  @Override
  public List<SecureStoreMetadata> list(String namespace) throws Exception {
    return secureStore.list(namespace);
  }

  @Override
  public SecureStoreData get(String namespace, String name) throws Exception {
    return secureStore.get(namespace, name);
  }

  @Override
  public void execute(final TxRunnable runnable) throws TransactionFailureException {
    execute(runnable, false);
  }

  /**
   * Execute in a transaction with optional retry on conflict.
   */
  public void execute(final TxRunnable runnable, boolean retryOnConflict) throws TransactionFailureException {
    ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getClass().getClassLoader());
    try {
      Transactional txnl = retryOnConflict
        ? Transactions.createTransactionalWithRetry(transactional, RetryStrategies.retryOnConflict(20, 100))
        : transactional;
      txnl.execute(new TxRunnable() {
        @Override
        public void run(DatasetContext context) throws Exception {
          ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getProgramInvocationClassLoader());
          try {
            runnable.run(context);
          } finally {
            ClassLoaders.setContextClassLoader(oldClassLoader);
          }
        }
      });
    } finally {
      ClassLoaders.setContextClassLoader(oldClassLoader);
    }
  }

  @Override
  public void execute(int timeoutInSeconds, final TxRunnable runnable) throws TransactionFailureException {
    ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getClass().getClassLoader());
    try {
      transactional.execute(timeoutInSeconds, new TxRunnable() {
        @Override
        public void run(DatasetContext context) throws Exception {
          ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getProgramInvocationClassLoader());
          try {
            runnable.run(context);
          } finally {
            ClassLoaders.setContextClassLoader(oldClassLoader);
          }
        }
      });
    } finally {
      ClassLoaders.setContextClassLoader(oldClassLoader);
    }
  }

  @Override
  public DataTracer getDataTracer(String dataTracerName) {
    ApplicationId applicationId = programRunId.getParent().getParent();
    return DataTracerFactoryProvider.get(applicationId).getDataTracer(applicationId, dataTracerName);
  }

  @Nullable
  @Override
  public TriggeringScheduleInfo getTriggeringScheduleInfo() {
    return triggeringScheduleInfo;
  }

  /**
   * Run some code with the context class loader combined from the program class loader and the system class loader.
   */
  public void execute(ThrowingRunnable runnable) throws Exception {
    ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getProgramInvocationClassLoader());
    try {
      runnable.run();
    } finally {
      ClassLoaders.setContextClassLoader(oldClassLoader);
    }
  }

  /**
   * Run some code with the context class loader combined from the program class loader and the system class loader.
   */
  public <T> T execute(Callable<T> callable) throws Exception {
    ClassLoader oldClassLoader = ClassLoaders.setContextClassLoader(getProgramInvocationClassLoader());
    try {
      return callable.call();
    } finally {
      ClassLoaders.setContextClassLoader(oldClassLoader);
    }
  }

  /**
   * Initialize a program. The initialize() method is executed with the context class loader combined from the
   * program class loader and the system class loader. If the transaction control is implicit, then this code
   * is wrapped into a transaction, possibly with retry on conflict.
   *
   * @param program the program to be initialized
   * @param txControl the transaction control
   * @param retryOnConflict if true, transactional execution will be retried on conflict
   * @param <T> the type of the program context
   */
  public <T extends RuntimeContext> void initializeProgram(final ProgramLifecycle<T> program,
                                                           TransactionControl txControl,
                                                           boolean retryOnConflict) throws Exception {
    if (TransactionControl.IMPLICIT == txControl) {
      execute(context -> {
        //noinspection unchecked
        program.initialize((T) AbstractContext.this);
      }, retryOnConflict);
    } else {
      execute(() -> {
        try {
          //noinspection unchecked
          program.initialize((T) AbstractContext.this);
        } catch (Error e) {
          // Need to wrap Error. Otherwise, listeners of this Guava Service may not be called if the
          // initialization of the user program is missing dependencies (CDAP-2543).
          // Guava 15.0+ have this condition fixed, hence wrapping is no longer needed if upgrade to later Guava.
          throw new Exception(e.getMessage(), e);
        }
      });
    }
  }

  /**
   * Destroy a program. The destroy() method is executed with the context class loader combined from the
   * program class loader and the system class loader. If the transaction control is implicit, then this code
   * is wrapped into a transaction, possibly with retry on conflict. This method never throw exception. Any error
   * raised during the destroy lifecycle call will just be logged.
   *
   * @param program the program to be destroyed
   * @param txControl the transaction control
   * @param retryOnConflict if true, transactional execution will be retried on conflict
   */
  public void destroyProgram(final ProgramLifecycle<?> program, TransactionControl txControl, boolean retryOnConflict) {
    try {
      try {
        if (TransactionControl.IMPLICIT == txControl) {
          execute(context -> program.destroy(), retryOnConflict);
        } else {
          execute(program::destroy);
        }
      } catch (TransactionConflictException e) {
        // For Tx conflict, use it as is.
        throw e;
      } catch (TransactionFailureException | UncheckedExecutionException e) {
        // For tx failure (implicit case) or unchecked execution exception (explicit with CDAP wrapper case),
        // throw the cause for logging.
        throw e.getCause() == null ? e : e.getCause();
      }
    } catch (Throwable t) {
      // Don't propagate exception raised by destroy() method
      ProgramRunId programRunId = getProgramRunId();
      LOG.error("Exception raised on destroy lifecycle method in class {} of the {} program of run {}",
                getProgram().getMainClassName(), programRunId.getType().getPrettyName(), programRunId, t);
    }
  }

  public RetryStrategy getRetryStrategy() {
    return retryStrategy;
  }

  public TransactionControl getDefaultTxControl() {
    return TransactionControl.valueOf(cConf.get(Constants.AppFabric.PROGRAM_TRANSACTION_CONTROL).toUpperCase());
  }

  /**
   * Returns the {@link ClassLoader} used for program method invocation.
   */
  public final ClassLoader getProgramInvocationClassLoader() {
    ClassLoader classLoader = programInvocationClassLoader;
    if (classLoader != null) {
      return classLoader;
    }

    synchronized (this) {
      classLoader = programInvocationClassLoader;
      if (classLoader != null) {
        return classLoader;
      }
      classLoader = programInvocationClassLoader = createProgramInvocationClassLoader();
      return classLoader;
    }
  }

  /**
   * Creates a new instance of {@link ClassLoader} that will be used for program method invocation.
   * By default it is a {@link CombineClassLoader} with program classloader,
   * plugins export-package classloader and system classloader in that loading order.
   */
  protected ClassLoader createProgramInvocationClassLoader() {
    // A classloader that can load all export-package classes from all plugins
    ClassLoader pluginsClassLoader = PluginClassLoaders.createFilteredPluginsClassLoader(
      program.getApplicationSpecification().getPlugins(), pluginInstantiator);

    return new CombineClassLoader(null, program.getClassLoader(), pluginsClassLoader, getClass().getClassLoader());
  }

  @Override
  public MessagePublisher getMessagePublisher() {
    return new ProgramMessagePublisher(getMessagingContext().getMessagePublisher());
  }

  @Override
  public MessagePublisher getDirectMessagePublisher() {
    return new ProgramMessagePublisher(getMessagingContext().getDirectMessagePublisher());
  }

  @Override
  public MessageFetcher getMessageFetcher() {
    return getMessagingContext().getMessageFetcher();
  }

  /**
   * Returns the {@link MessagingService} for interacting with TMS directly.
   */
  public MessagingService getMessagingService() {
    return messagingService;
  }

  /**
   * Returns the {@link MessagingContext} used for interacting with TMS.
   */
  protected MessagingContext getMessagingContext() {
    return messagingContext;
  }

  @Override
  public Map<MetadataScope, Metadata> getMetadata(MetadataEntity metadataEntity) throws MetadataException {
    return metadataReader.getMetadata(metadataEntity);
  }

  @Override
  public Metadata getMetadata(MetadataScope scope, MetadataEntity metadataEntity) throws MetadataException {
    return metadataReader.getMetadata(scope, metadataEntity);
  }

  @Override
  public void addProperties(MetadataEntity metadataEntity, Map<String, String> properties) {
    metadataPublisher.publish(programRunId,
                              new MetadataOperation.Put(metadataEntity, properties, Collections.emptySet()));
  }

  @Override
  public void addTags(MetadataEntity metadataEntity, String... tags) {
    addTags(metadataEntity, Arrays.asList(tags));
  }

  @Override
  public void addTags(MetadataEntity metadataEntity, Iterable<String> tags) {
    metadataPublisher.publish(programRunId, new MetadataOperation.Put(
      metadataEntity, Collections.emptyMap(), ImmutableSet.copyOf(tags)));
  }

  @Override
  public void removeMetadata(MetadataEntity metadataEntity) {
    metadataPublisher.publish(programRunId, new MetadataOperation.DeleteAll(metadataEntity));
  }

  @Override
  public void removeProperties(MetadataEntity metadataEntity) {
    metadataPublisher.publish(programRunId, new MetadataOperation.DeleteAllProperties(metadataEntity));
  }

  @Override
  public void removeProperties(MetadataEntity metadataEntity, String... keys) {
    metadataPublisher.publish(programRunId, new MetadataOperation.Delete(
      metadataEntity, ImmutableSet.copyOf(keys), Collections.emptySet()));
  }

  @Override
  public void removeTags(MetadataEntity metadataEntity) {
    metadataPublisher.publish(programRunId, new MetadataOperation.DeleteAllTags(metadataEntity));
  }

  @Override
  public void removeTags(MetadataEntity metadataEntity, String... tags) {
    metadataPublisher.publish(programRunId, new MetadataOperation.Delete(
      metadataEntity, Collections.emptySet(), ImmutableSet.copyOf(tags)));
  }

  /**
   * Creates a new instance of {@link RuntimeProgramContext} to be
   * provided to {@link RuntimeProgramContextAware} dataset.
   */
  private RuntimeProgramContext createRuntimeProgramContext(final DatasetId datasetId) {
    return new RuntimeProgramContext() {

      @Override
      public void notifyNewPartitions(Collection<? extends PartitionKey> partitionKeys) throws IOException {
        String topic = cConf.get(Constants.Dataset.DATA_EVENT_TOPIC);
        if (Strings.isNullOrEmpty(topic)) {
          // Don't publish if there is no data event topic
          return;
        }

        TopicId dataEventTopic = NamespaceId.SYSTEM.topic(topic);
        MessagePublisher publisher = getMessagingContext().getMessagePublisher();

        byte[] payload = Bytes.toBytes(GSON.toJson(Notification.forPartitions(datasetId, partitionKeys)));
        int failure = 0;
        long startTime = System.currentTimeMillis();
        while (true) {
          try {
            publisher.publish(dataEventTopic.getNamespace(), dataEventTopic.getTopic(), payload);
            return;
          } catch (TopicNotFoundException e) {
            // this shouldn't happen since the TMS creates the data event topic on startup.
            throw new IOException("Unexpected exception due to missing topic '" + dataEventTopic + "'", e);
          } catch (IOException e) {
            long sleepTime = retryStrategy.nextRetry(++failure, startTime);
            if (sleepTime < 0) {
              throw e;
            }
            try {
              TimeUnit.MILLISECONDS.sleep(sleepTime);
            } catch (InterruptedException ex) {
              // If interrupted during sleep, just reset the interrupt flag and return
              Thread.currentThread().interrupt();
              return;
            }
          }
        }
      }

      @Override
      public ProgramRunId getProgramRunId() {
        return programRunId;
      }

      @Nullable
      @Override
      public NamespacedEntityId getComponentId() {
        return AbstractContext.this.getComponentId();
      }
    };
  }

  /**
   * @return the {@link Set} of field lineage operations
   */
  public Set<Operation> getFieldLineageOperations() {
    return fieldLineageOperations;
  }

  @Override
  public synchronized void record(Collection<? extends Operation> operations) {
    fieldLineageOperations.addAll(operations);
  }

  @Override
  public synchronized void flushLineage() {
    FieldLineageInfo info = new FieldLineageInfo(fieldLineageOperations);
    fieldLineageWriter.write(programRunId, info);
    fieldLineageOperations.clear();
  }
}
