import React from 'react';
import { ArrowUpDown, Ellipsis, Grid3X3, List, Megaphone, Plus, SquarePen, Star, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import CampaignStructureView from '@/features/campaign/structure/CampaignStructureView';

export function ProjectsSection(props: any) {
  const {
    selectedCampaignId, campaigns, setSelectedCampaignId, companyDomain, domainContext, keywordsTableData,
    hasWordpressIntegration, wpIntegration, handleConfigureWordpress, fetchWordpressIntegration, activeTab, fetchCampaignTabData,
    campaignViewMode, setCampaignViewMode, sidebarOpen, publishingPageIds, setPublishingPageIds, draftToPageMap, setDraftToPageMap,
    draftStatuses, setDraftStatuses, sharedPublishStatuses, handlePublishUpdate, getCampaignPageDisplayName, generationJobs,
    setGenerationJobs, campaignPageIdContext, setCampaignPageIdContext, currentGenerationTopicId, setCurrentGenerationTopicId,
    showCreateCampaign, setShowCreateCampaign, handleCreateCampaign, newCampaignTitle, setNewCampaignTitle, setNewCampaignDescription,
    campaignLayout, setCampaignLayout, openSortMenu, setOpenSortMenu, sortBy, setSortBy, activeSection, setActiveSection,
    campaignsLoading, campaignTabDataLoading, favouriteIds, editingCampaignId, toggleFavourite, openMenuId, setOpenMenuId,
    setEditingCampaignId, setEditTitle, setEditDescription, setShowEditModal, confirmDelete, handleDeleteCampaign,
    showEditModal, handleUpdateCampaign, editTitle
  } = props;

  return (
            (() => {
              if (selectedCampaignId) {
                 const selectedCampaign = campaigns.find(
                    (c) => c.id === selectedCampaignId
                  );
                  if (!selectedCampaign) {
                    return (
                      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                        <div className="bg-white rounded-3xl p-8 border border-red-100 text-center text-sm text-red-600">
                        Selected campaign could not be found. Please go back and
                        try again.
                        <div className="mt-4">
                          <button
                            onClick={() => setSelectedCampaignId(null)}
                            className="px-5 py-2 bg-black text-white rounded-full text-sm"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                      </div>
                    );
                  }
                  return (
                    <CampaignStructureView
                      campaign={selectedCampaign}
                      onBack={() => setSelectedCampaignId(null)}
                      companyDomain={companyDomain}
                      domainContext={domainContext}
                      keywordsTableData={keywordsTableData}
                      hasWordpressIntegration={hasWordpressIntegration}
                      wpIntegration={wpIntegration}
                      onConfigureWordpress={handleConfigureWordpress}
                      onRefreshWordpressIntegration={async () => {
                        await fetchWordpressIntegration();
                        if (activeTab === 'projects') {
                          await fetchCampaignTabData();
                        }
                      }}
                      viewMode={campaignViewMode}
                      onViewModeChange={setCampaignViewMode}
                      sidebarOpen={sidebarOpen}
                      // Pass sync states from parent
                      publishingPageIds={publishingPageIds}
                      setPublishingPageIds={setPublishingPageIds}
                      draftToPageMap={draftToPageMap}
                      setDraftToPageMap={setDraftToPageMap}
                      draftStatuses={draftStatuses}
                      setDraftStatuses={setDraftStatuses}
                      sharedPublishStatuses={sharedPublishStatuses}
                      onPublishUpdate={handlePublishUpdate}
                      getCampaignPageDisplayName={getCampaignPageDisplayName}
                      generationJobs={generationJobs}
                      setGenerationJobs={setGenerationJobs}
                      campaignPageIdContext={campaignPageIdContext}
                      setCampaignPageIdContext={setCampaignPageIdContext}
                      currentGenerationTopicId={currentGenerationTopicId}
                      setCurrentGenerationTopicId={setCurrentGenerationTopicId}
                    />
                  );
              }

              // Default Campaign List View (Centered)
              return (
                <div className="relative w-full">
    {/* Create Campaign Form */}
                {showCreateCampaign && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* Overlay */}
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onClick={() => setShowCreateCampaign(false)}
    />

    {/* Modal */}
    <div className="relative w-full max-w-xl mx-4 bg-white rounded-xl p-8 border border-gray-100 shadow-xl">
      <h3 className="text-xl font-light text-black tracking-tight mb-6">
        Create New Project
      </h3>

      <form onSubmit={handleCreateCampaign} className="space-y-6">
        <div>
          <label className="block text-base font-light text-black mb-2">
            Title
          </label>
          <input
            type="text"
            value={newCampaignTitle}
            onChange={(e) => setNewCampaignTitle(e.target.value)}
            placeholder="Enter project title"
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-black focus:outline-none"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => {
              setShowCreateCampaign(false);
              setNewCampaignTitle("");
              setNewCampaignDescription("");
            }}
            className="px-6 py-3 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="px-6 py-3 bg-black text-white rounded-md hover:opacity-90"
            style={{
    background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
  }}
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  </div>
)}

              <div className="min-w-8xl px-1 sm:px-1 py-2 sm:py-">
  {/* Header */}
                 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">

 {/* New Campaign */}
    <button
      onClick={() => setShowCreateCampaign(!showCreateCampaign)}
      className="inline-flex border border-gray-700 items-center gap-2 px-5 py-2.5 bg-white text-black rounded-md text-md font-medium hover:bg-gray-200 transition"
    >
      <Plus className="h-4 w-4" />
      {showCreateCampaign ? "Cancel" : "Create New"}
    </button>

{/* Actions */}
<div className="flex items-center gap-1">

  {/* Layout Toggle */}
  <button
    onClick={() =>
      setCampaignLayout(campaignLayout === "grid" ? "list" : "grid")
    }
    className="flex items-center gap-1 px-3 py-2 rounded-md hover:bg-gray-200 transition"
  >
    {campaignLayout === "grid" ? (
      <>
        <List className="h-4 w-5" />
        <span className="text-sm font-medium text-gray-700">List</span>
      </>
    ) : (
      <>
        <Grid3X3 className="h-4 w-5" />
        <span className="text-sm font-medium text-gray-700">Grid</span>
      </>
    )}
  </button>

  {/* Sort Button */}
 <div className="relative">
  <button
    onClick={() => setOpenSortMenu(!openSortMenu)}
    className="flex items-center gap-1 px-3 py-2 rounded-md hover:bg-gray-200 transition"
  >
    <ArrowUpDown className="h-5 w-5" />
    <span className="text-sm font-medium text-gray-700">Sort</span>
  </button>

  {openSortMenu && (
    <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-10">
      <button
        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
          sortBy === "date" ? "font-semibold" : ""
        }`}
        onClick={() => {
          setSortBy("date");
          setOpenSortMenu(false);
        }}
      >
        Date
      </button>

      <button
        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
          sortBy === "name" ? "font-semibold" : ""
        }`}
        onClick={() => {
          setSortBy("name");
          setOpenSortMenu(false);
        }}
      >
        Name
      </button>
    </div>
  )}
</div>

</div>
</div>


                <div className='p-4 mb-6 sm:p-6 bg-white rounded-xl border border-gray-100  overflow-hidden backdrop-blur-sm'>
         <div className="flex gap-6 border-b border-gray-200 mb-6">
  {['all', 'favourites'].map((section) => (
    <button
      key={section}
      onClick={() => setActiveSection(section as 'all' | 'favourites' )}
      className={`relative pb-2 text-sm font-medium transition-colors ${
        activeSection === section
          ? 'text-black after:absolute after:-bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-black'
          : 'text-gray-500 hover:text-black'
      }`}
    >
      {section === 'all' ? 'All' : section === 'favourites' ? 'Favourites' : 'Published'}
    </button>
  ))}
</div>
              {/* Campaigns List */}
              {(() => {
                if (campaignsLoading || campaignTabDataLoading) {
                  return (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                      <p className="text-sm font-light text-gray-600 mt-4">
                        {campaignsLoading ? 'Loading projects...' : 'Loading project data...'}
                      </p>
                    </div>
                  );
                }
                
                // Note: selectedCampaignId case is handled above the container now
                
                if (campaigns.length === 0) {
                  return (
                    <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
                      <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                        <Megaphone className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-xl font-light text-black tracking-tight mb-3">
                        No Projects Yet
                      </h3>
                      <p className="text-base font-light text-gray-600 mb-6">
                        Create your first project to get started
                      </p>
                      <button
                        onClick={() => setShowCreateCampaign(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-md hover:opacity-90"
            style={{
    background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
  }} >
                        <Plus className="h-5 w-5" />
                        Create New
                      </button>
                    </div>
                  );
                }

               return (
<div
  className={
    campaignLayout === "grid"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      : "flex flex-col gap-4"
  }
>
  {[...campaigns]
  
 .filter(campaign => {
  switch (activeSection) {
    case "favourites":
      return favouriteIds.has(campaign.id);

    case "all":
    default:
      return true;
  }
})
  .sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else {
      return a.title.localeCompare(b.title);
    }
  })
  .map((campaign) => {
    const isEditing = editingCampaignId === campaign.id;
    const isFavourite = favouriteIds.has(campaign.id);
    

    return (
      <div
  key={campaign.id}
  className={`
    bg-white rounded-md border border-gray-100  shadow-sm p-4 flex flex-col justify-between
    ${campaignLayout === "grid" ? "min-h-[200px]" : "min-h-[100px]"}
  `}
>
        
        {/* Active Badge */}
      
        <div className="flex justify-between items-center">
          <div className="w-fit inline-flex items-center text-xs font-medium bg-blue-50 border border-blue-400 text-blue-700 px-2 rounded-full mb-2">
            Active
          </div>
          {/* Actions: Star + 3-dots */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => toggleFavourite(campaign.id)}
              className="rounded-lg transition p-2"
            >
              <Star
                className="h-5 w-5"
                fill={isFavourite ? "#f77373" : "none"}
                stroke={isFavourite ? "rgb(199, 29, 7)" : "#000000"}
              />
            </button>

            {/* 3-dots menu */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)
                }
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
              >
                <Ellipsis className="h-5 w-5 text-black" />
              </button>

              {openMenuId === campaign.id && (
                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setEditingCampaignId(campaign.id);
                      setEditTitle(campaign.title);
                      setEditDescription(campaign.description || "");
                      setShowEditModal(true);
                      setOpenMenuId(null);
                    }}
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                    Edit
                  </button>

                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                    onClick={() => {
                      confirmDelete("Project", () => handleDeleteCampaign(campaign.id));
                      setOpenMenuId(null);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        

        {/* Top row: Title + Actions */}
          <div
            onClick={() => setSelectedCampaignId(campaign.id)}
            className="cursor-pointer flex-1 overflow-hidden mr-4 pt-2"
            title={campaign.title}
          >
            <h3 className="text-lg font-medium text-black tracking-tight truncate">
              {campaign.title}
            </h3>
          </div>


        {/* Bottom row: Created time */}
        {campaign.createdAt && (
          <div className="flex justify-end mt-4">
            <p className="text-sm text-gray-500">
              {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
            </p>
          </div>
        )}
      </div>
    );
  })}
</div>
);

              })()}
            </div>
              {showEditModal && editingCampaignId !== null && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-lg">
      <h3 className="text-xl font-light text-black tracking-tight mb-6">
        Edit Project
      </h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await handleUpdateCampaign();
          setShowEditModal(false);
          setEditingCampaignId(null);
          setEditTitle('');
          setEditDescription('');
        }}
        className="space-y-6"
      >
        <div>
          <label className="block text-base font-light text-black mb-2">
            Title
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Enter project title"
            className="w-full px-4 py-3 text-base font-light rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
        </div>
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => setShowEditModal(false)}
            className="px-6 py-3 rounded-full border text-gray-700 border-gray-200 bg-white text-sm hover:bg-gray-100 hover:text-gray-700  transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-3 inline-flex items-center gap-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
)}
            </div>
            </div>
            );
            })()
  );
}


