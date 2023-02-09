import React, { useCallback, useState } from 'react';
import { Alert, Divider } from 'antd';
import { MutationHookOptions, MutationTuple, QueryHookOptions, QueryResult } from '@apollo/client/react/types/types';
import styled from 'styled-components/macro';
import { useHistory } from 'react-router';
import dayjs from 'dayjs';

import { EntityType, Exact } from '../../../../../types.generated';
import { Message } from '../../../../shared/Message';
import { getEntityPath, getOnboardingStepIdsForEntityType, useRoutedTab } from './utils';
import {
    EntitySidebarSection,
    EntitySubHeaderSection,
    EntityTab,
    GenericEntityProperties,
    GenericEntityUpdate,
} from '../../types';
import { EntityProfileNavBar } from './nav/EntityProfileNavBar';
import { ANTD_GRAY } from '../../constants';
import { EntityHeader } from './header/EntityHeader';
import { EntityTabs } from './header/EntityTabs';
import { EntitySidebar } from './sidebar/EntitySidebar';
import EntityContext from '../../EntityContext';
import useIsLineageMode from '../../../../lineage/utils/useIsLineageMode';
import { useEntityRegistry } from '../../../../useEntityRegistry';
import LineageExplorer from '../../../../lineage/LineageExplorer';
import CompactContext from '../../../../shared/CompactContext';
import DynamicTab from '../../tabs/Entity/weaklyTypedAspects/DynamicTab';
import analytics, { EventType } from '../../../../analytics';
import { ProfileSidebarResizer } from './sidebar/ProfileSidebarResizer';
import { EntityMenuItems } from '../../EntityDropdown/EntityDropdown';
import GlossaryBrowser from '../../../../glossary/GlossaryBrowser/GlossaryBrowser';
import GlossarySearch from '../../../../glossary/GlossarySearch';
import { BrowserWrapper, MAX_BROWSER_WIDTH, MIN_BROWSWER_WIDTH } from '../../../../glossary/BusinessGlossaryPage';
import { useIsSeparateSiblingsMode } from '../../siblingUtils';
import { EntityActionItem } from '../../entity/EntityActions';
import { ErrorSection } from '../../../../shared/error/ErrorSection';
import { EntityHead } from '../../../../shared/EntityHead';
import { OnboardingTour } from '../../../../onboarding/OnboardingTour';
import useGetDataForProfile from './useGetDataForProfile';
import NonExistentEntityPage from '../../entity/NonExistentEntityPage';
import {
    LINEAGE_GRAPH_INTRO_ID,
    LINEAGE_GRAPH_TIME_FILTER_ID,
} from '../../../../onboarding/config/LineageGraphOnboardingConfig';

type Props<T, U> = {
    urn: string;
    entityType: EntityType;
    useEntityQuery: (
        baseOptions: QueryHookOptions<
            T,
            Exact<{
                urn: string;
            }>
        >,
    ) => QueryResult<
        T,
        Exact<{
            urn: string;
        }>
    >;
    useUpdateQuery?: (
        baseOptions?: MutationHookOptions<U, { urn: string; input: GenericEntityUpdate }> | undefined,
    ) => MutationTuple<U, { urn: string; input: GenericEntityUpdate }>;
    getOverrideProperties: (T) => GenericEntityProperties;
    tabs: EntityTab[];
    sidebarSections: EntitySidebarSection[];
    customNavBar?: React.ReactNode;
    subHeader?: EntitySubHeaderSection;
    headerDropdownItems?: Set<EntityMenuItems>;
    headerActionItems?: Set<EntityActionItem>;
    displayGlossaryBrowser?: boolean;
    isNameEditable?: boolean;
};

const ContentContainer = styled.div`
    display: flex;
    height: auto;
    min-height: 100%;
    flex: 1;
`;

const HeaderAndTabs = styled.div`
    flex-grow: 1;
    min-width: 640px;
`;

const HeaderAndTabsFlex = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    min-height: 0;
    overflow-y: auto;

    &::-webkit-scrollbar {
        height: 12px;
        width: 2px;
        background: #f2f2f2;
    }
    &::-webkit-scrollbar-thumb {
        background: #cccccc;
        -webkit-border-radius: 1ex;
        -webkit-box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.75);
    }
`;
const Sidebar = styled.div<{ $width: number }>`
    max-height: 100%;
    overflow: auto;
    width: ${(props) => props.$width}px;
    min-width: ${(props) => props.$width}px;
    padding-left: 20px;
    padding-right: 20px;
`;

const Header = styled.div`
    border-bottom: 1px solid ${ANTD_GRAY[4.5]};
    padding: 20px 20px 0 20px;
    flex-shrink: 0;
`;

const TabContent = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: auto;
`;

const defaultTabDisplayConfig = {
    visible: (_, _1) => true,
    enabled: (_, _1) => true,
};

const defaultSidebarSection = {
    visible: (_, _1) => true,
};

const MAX_SIDEBAR_WIDTH = 800;
const MIN_SIDEBAR_WIDTH = 200;

/**
 * Container for display of the Entity Page
 */
export const EntityProfile = <T, U>({
    urn,
    useEntityQuery,
    useUpdateQuery,
    entityType,
    getOverrideProperties,
    tabs,
    sidebarSections,
    customNavBar,
    headerDropdownItems,
    headerActionItems,
    displayGlossaryBrowser,
    isNameEditable,
    subHeader,
}: Props<T, U>): JSX.Element => {
    const isLineageMode = useIsLineageMode();
    const isHideSiblingMode = useIsSeparateSiblingsMode();
    const entityRegistry = useEntityRegistry();
    const history = useHistory();
    const isCompact = React.useContext(CompactContext);
    const tabsWithDefaults = tabs.map((tab) => ({ ...tab, display: { ...defaultTabDisplayConfig, ...tab.display } }));
    const sideBarSectionsWithDefaults = sidebarSections.map((sidebarSection) => ({
        ...sidebarSection,
        display: { ...defaultSidebarSection, ...sidebarSection.display },
    }));

    const [sidebarWidth, setSidebarWidth] = useState(window.innerWidth * 0.25);
    const [browserWidth, setBrowserWith] = useState(window.innerWidth * 0.2);
    const [shouldUpdateBrowser, setShouldUpdateBrowser] = useState(false);
    const entityStepIds: string[] = getOnboardingStepIdsForEntityType(entityType);
    const lineageGraphStepIds: string[] = [LINEAGE_GRAPH_INTRO_ID, LINEAGE_GRAPH_TIME_FILTER_ID];
    const stepIds = isLineageMode ? lineageGraphStepIds : entityStepIds;

    function refreshBrowser() {
        setShouldUpdateBrowser(true);
        setTimeout(() => setShouldUpdateBrowser(false), 0);
    }

    const routeToTab = useCallback(
        ({
            tabName,
            tabParams,
            method = 'push',
        }: {
            tabName: string;
            tabParams?: Record<string, any>;
            method?: 'push' | 'replace';
        }) => {
            let modifiedTabParams = tabParams;
            if (tabName === 'Lineage') {
                modifiedTabParams = {
                    ...tabParams,
                    start_time_millis: dayjs().subtract(14, 'day').valueOf(),
                    end_time_millis: dayjs().valueOf(),
                };
            }
            analytics.event({
                type: EventType.EntitySectionViewEvent,
                entityType,
                entityUrn: urn,
                section: tabName.toLowerCase(),
            });
            history[method](
                getEntityPath(entityType, urn, entityRegistry, false, isHideSiblingMode, tabName, modifiedTabParams),
            );
        },
        [history, entityType, urn, entityRegistry, isHideSiblingMode],
    );

    const { entityData, dataPossiblyCombinedWithSiblings, dataNotCombinedWithSiblings, loading, error, refetch } =
        useGetDataForProfile({ urn, entityType, useEntityQuery, getOverrideProperties });

    const maybeUpdateEntity = useUpdateQuery?.({
        onCompleted: () => refetch(),
    });
    let updateEntity;
    if (maybeUpdateEntity) {
        [updateEntity] = maybeUpdateEntity;
    }

    const lineage = entityData ? entityRegistry.getLineageVizConfig(entityType, entityData) : undefined;

    const autoRenderTabs: EntityTab[] =
        entityData?.autoRenderAspects?.map((aspect) => ({
            name: aspect.renderSpec?.displayName || aspect.aspectName,
            component: () => (
                <DynamicTab
                    renderSpec={aspect.renderSpec}
                    type={aspect.renderSpec?.displayType}
                    payload={aspect.payload}
                />
            ),
            display: {
                visible: () => true,
                enabled: () => true,
            },
        })) || [];

    const visibleTabs = [...tabsWithDefaults, ...autoRenderTabs].filter((tab) =>
        tab.display?.visible(entityData, dataPossiblyCombinedWithSiblings),
    );

    const enabledAndVisibleTabs = visibleTabs.filter((tab) =>
        tab.display?.enabled(entityData, dataPossiblyCombinedWithSiblings),
    );

    const routedTab = useRoutedTab(enabledAndVisibleTabs);

    if (entityData?.exists === false) {
        return <NonExistentEntityPage />;
    }

    if (isCompact) {
        return (
            <EntityContext.Provider
                value={{
                    urn,
                    entityType,
                    entityData,
                    loading,
                    baseEntity: dataPossiblyCombinedWithSiblings,
                    dataNotCombinedWithSiblings,
                    updateEntity,
                    routeToTab,
                    refetch,
                    lineage,
                }}
            >
                <div>
                    {loading && <Message type="loading" content="Loading..." style={{ marginTop: '10%' }} />}
                    {(error && <ErrorSection />) ||
                        (!loading && (
                            <>
                                <EntityHeader
                                    headerDropdownItems={headerDropdownItems}
                                    headerActionItems={headerActionItems}
                                    subHeader={subHeader}
                                />
                                <Divider style={{ marginBottom: '0' }} />
                                <EntitySidebar sidebarSections={sideBarSectionsWithDefaults} />
                            </>
                        ))}
                </div>
            </EntityContext.Provider>
        );
    }

    const isBrowsable = entityRegistry.getBrowseEntityTypes().includes(entityType);
    const isLineageEnabled = entityRegistry.getLineageEntityTypes().includes(entityType);
    const showBrowseBar = isBrowsable || isLineageEnabled;

    console.log('headerDropdownItems', headerDropdownItems);

    return (
        <EntityContext.Provider
            value={{
                urn,
                entityType,
                entityData,
                loading,
                baseEntity: dataPossiblyCombinedWithSiblings,
                dataNotCombinedWithSiblings,
                updateEntity,
                routeToTab,
                refetch,
                lineage,
            }}
        >
            <>
                <OnboardingTour stepIds={stepIds} />
                <EntityHead />
                {customNavBar}
                {showBrowseBar && !customNavBar && <EntityProfileNavBar urn={urn} entityType={entityType} />}
                {entityData?.status?.removed === true && (
                    <Alert
                        message="This entity is not discoverable via search or lineage graph. Contact your DataHub admin for more information."
                        banner
                    />
                )}
                {loading && <Message type="loading" content="Loading..." style={{ marginTop: '10%' }} />}
                {(error && <ErrorSection />) || (
                    <ContentContainer>
                        {isLineageMode ? (
                            <LineageExplorer type={entityType} urn={urn} />
                        ) : (
                            <>
                                {displayGlossaryBrowser && (
                                    <>
                                        <BrowserWrapper width={browserWidth}>
                                            <GlossarySearch />
                                            <GlossaryBrowser openToEntity refreshBrowser={shouldUpdateBrowser} />
                                        </BrowserWrapper>
                                        <ProfileSidebarResizer
                                            setSidePanelWidth={(width) =>
                                                setBrowserWith(
                                                    Math.min(Math.max(width, MIN_BROWSWER_WIDTH), MAX_BROWSER_WIDTH),
                                                )
                                            }
                                            initialSize={browserWidth}
                                            isSidebarOnLeft
                                        />
                                    </>
                                )}
                                <HeaderAndTabs>
                                    <HeaderAndTabsFlex>
                                        <Header>
                                            Aqui esta pasando
                                            <EntityHeader
                                                headerDropdownItems={headerDropdownItems}
                                                headerActionItems={headerActionItems}
                                                isNameEditable={isNameEditable}
                                                subHeader={subHeader}
                                                refreshBrowser={refreshBrowser}
                                            />
                                            <EntityTabs tabs={visibleTabs} selectedTab={routedTab} />
                                        </Header>
                                        <TabContent>
                                            {routedTab && <routedTab.component properties={routedTab.properties} />}
                                        </TabContent>
                                    </HeaderAndTabsFlex>
                                </HeaderAndTabs>
                                <ProfileSidebarResizer
                                    setSidePanelWidth={(width) =>
                                        setSidebarWidth(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH))
                                    }
                                    initialSize={sidebarWidth}
                                />
                                <Sidebar $width={sidebarWidth}>
                                    <EntitySidebar sidebarSections={sideBarSectionsWithDefaults} />
                                </Sidebar>
                            </>
                        )}
                    </ContentContainer>
                )}
            </>
        </EntityContext.Provider>
    );
};
