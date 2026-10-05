import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Plus, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import ProjectCard from "../components/ProjectCard";
import { useSeo } from "../lib/seo";
import classes from "./Projects.module.css";

// Only the most-used themes are shown up front; the rest live behind
// "Tous les thèmes" so the page does not open on a wall of 130+ chips.
const POPULAR_TAGS_COUNT = 8;
// Projects are loaded page by page from the server ("Voir plus"),
// filters and search are applied server-side.
const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  useSeo({ title: t("seo.projectsTitle"), description: t("seo.projectsDescription"), path: "/projects" });

  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [topTags, setTopTags] = useState([]);
  const [allRegions, setAllRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setDebouncedQuery("");
      return undefined;
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const myId = user?._id || user?.id || "";

  const [recommended, setRecommended] = useState([]);
  const [boosted, setBoosted] = useState([]); // projets mis en avant (emplacement dédié, visible par tous)

  useEffect(() => {
    if(!user){
      return;
    }
    const fetchRecommended = async() => {
      try {
        const data = await api("/projects/recommended");
        setRecommended(Array.isArray(data) ? data.map(item => item.project) : []);
      } catch(err) {
        console.error("fetchRecommended error:", err);
      }
    }
    fetchRecommended();
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTags();
    fetchRegions();
    api("/projects/boosted")
      .then((data) => setBoosted(Array.isArray(data) ? data : []))
      .catch(() => setBoosted([]));
  }, []);

  // Un projet déjà affiché dans « Mis en avant » n'est pas répété dans les recommandations
  const boostedIds = new Set(boosted.map((p) => p._id));
  const recommendedShown = recommended.filter((p) => p && !boostedIds.has(p._id));

  const fetchPage = useCallback(async (pageToLoad) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageToLoad) });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    if (selectedRegion) params.set("region", selectedRegion);

    // Ignore responses from requests that were superseded by newer filters.
    const id = ++requestId.current;
    if (pageToLoad === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await api(`/projects?${params.toString()}`);
      if (id !== requestId.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setProjects((prev) => (pageToLoad === 1 ? items : [...prev, ...items]));
      setTotal(Number(data?.total) || 0);
      setHasMore(Boolean(data?.hasMore));
      setPage(pageToLoad);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error("Erreur chargement projets:", err);
      if (pageToLoad === 1) {
        setProjects([]);
        setTotal(0);
        setHasMore(false);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery, selectedTags, selectedRegion]);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage, myId]);

  const fetchTags = async () => {
    try {
      const [data, popular] = await Promise.all([
        api("/projects/tags"),
        api(`/projects/tags?popular=${POPULAR_TAGS_COUNT}`),
      ]);
      setAllTags(Array.isArray(data) ? data.filter((t) => t && t.trim()) : []);
      setTopTags(Array.isArray(popular) ? popular : []);
    } catch (err) {
      console.error("Erreur chargement tags:", err);
    }
  };

  const fetchRegions = async () => {
    try {
      const data = await api("/projects/regions");
      setAllRegions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement régions:", err);
    }
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedRegion("");
  };

  const hasActiveFilters = searchQuery || selectedTags.length > 0 || selectedRegion;

  // Most-used themes (computed server-side), plus any theme the user already picked.
  const popularTags = useMemo(
    () => [...new Set([...selectedTags, ...topTags])],
    [selectedTags, topTags],
  );

  const matchingTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return q ? allTags.filter((tag) => tag.toLowerCase().includes(q)) : allTags;
  }, [allTags, tagQuery]);

  return (
    <div className={classes.page}>
      {/* HEADER */}
      <div className={classes.header}>
        <div className={classes.container}>
          <div className={classes.headerRow}>
            <div>
              <h1 className={classes.title}>{t("projects.title")}</h1>
              <p className={classes.subtitle}>{t("projects.subtitle")}</p>
            </div>

            {user && (
              <button className={classes.createBtn} onClick={() => navigate("/create-project")}>
                <Plus size={18} />
                {t("projects.create")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={classes.container}>
        {/* SEARCH + REGION */}
        <div className={classes.searchRow}>
          <div className={classes.searchBlock}>
            <Search size={18} className={classes.searchIcon} aria-hidden="true" />
            <input
              type="search"
              aria-label={t("projects.searchPlaceholder")}
              placeholder={t("projects.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={classes.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={classes.clearBtn}
                aria-label={t("projects.clearSearch")}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {allRegions.length > 0 && (
            <label className={classes.regionSelect}>
              <span className="sr-only">{t("projects.regions")}</span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                <option value="">{t("projects.allRegions")}</option>
                {allRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          )}
        </div>

        {/* THEMES */}
        <div className={classes.filters}>
          <div className={classes.filterList}>
            <span className={classes.filterLabel}>{t("projects.popular")}</span>
            {popularTags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                aria-pressed={selectedTags.includes(tag)}
                className={`${classes.filterBtn} ${selectedTags.includes(tag) ? classes.activeFilter : ""}`}
              >
                {tag}
              </button>
            ))}
            {allTags.length > popularTags.length && (
              <button
                type="button"
                onClick={() => setShowAllTags((prev) => !prev)}
                aria-expanded={showAllTags}
                className={classes.moreTagsBtn}
              >
                {showAllTags ? t("projects.hideThemes") : t("projects.allThemes")}
                <ChevronDown size={14} className={showAllTags ? classes.chevronOpen : ""} aria-hidden="true" />
              </button>
            )}
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={classes.clearFilters}>
                {t("projects.resetFilters")}
              </button>
            )}
          </div>

          {showAllTags && (
            <div className={classes.allThemes}>
              <input
                type="search"
                className={classes.themeSearch}
                placeholder={t("projects.searchThemes")}
                aria-label={t("projects.searchThemes")}
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
              />
              <div className={classes.filterList}>
                {matchingTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selectedTags.includes(tag)}
                    className={`${classes.filterBtn} ${selectedTags.includes(tag) ? classes.activeFilter : ""}`}
                  >
                    {tag}
                  </button>
                ))}
                {matchingTags.length === 0 && (
                  <span className={classes.noTheme}>{t("projects.noTheme")}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MIS EN AVANT (boosts) */}
        {boosted.length > 0 && !hasActiveFilters && (
          <div className={classes.recommendedSection}>
            <h2 className={classes.recommendedTitle}>{t("billing.boostedSection")}</h2>
            <p className={classes.sectionHint}>{t("billing.boostedHint")}</p>
            <div className={classes.grid}>
              {boosted.map((project) => (
                <ProjectCard key={project._id} project={project} />
              ))}
            </div>
          </div>
        )}

        {/* RECOMMANDÉS */}
        {user && recommendedShown.length > 0 && !hasActiveFilters && (
          <div className={classes.recommendedSection}>
            <h2 className={classes.recommendedTitle}>{t("projects.recommended")}</h2>
            <div className={classes.grid}>
              {recommendedShown.map((project) => (
                <ProjectCard key={project._id} project={project} />
              ))}
            </div>
          </div>
        )}

        {/* RESULTS COUNT */}
        <div className={classes.results}>
          {t("projects.result", { count: total })}
        </div>

        {/* GRID */}
        {loading ? (
          <div className={classes.center}>{t("projects.loading")}</div>
        ) : projects.length === 0 ? (
          <div className={classes.center}>{t("projects.noResults")}</div>
        ) : (
          <>
            <div className={classes.grid}>
              {projects.map((project) => (
                <ProjectCard key={project._id} project={project} />
              ))}
            </div>
            {hasMore && (
              <div className={classes.loadMoreRow}>
                <button
                  type="button"
                  className={classes.loadMoreBtn}
                  onClick={() => fetchPage(page + 1)}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? t("projects.loadingMore")
                    : t("projects.loadMore", { count: total - projects.length })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
