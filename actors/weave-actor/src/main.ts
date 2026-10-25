import { Actor, log } from 'apify';

interface Input {
    instagramUsernames?: string[];
    tiktokProfiles?: string[];
    resultsPerSource?: number;
    newerThan?: string;
}

interface UnifiedPost {
    platform: 'instagram' | 'tiktok';
    sourceProfile: string;
    postUrl: string;
    postId: string;
    postedAt: string | null;
    caption: string;
    photos: string[];
    videos: string[];
    audioName: string | null;
    audioArtist: string | null;
    location: string | null;
    locationId: number | null;
    videoDurationSecs: number | null;
    likes: number | null;
    comments: number | null;
    views: number | null;
    /** Poster frame for videos (IG displayUrl / TikTok cover). */
    thumbnailUrl: string | null;
    /** Account profile picture — for official accounts, the team/brand logo (TikTok only). */
    authorAvatarUrl: string | null;
}

const INSTAGRAM_ACTOR = 'apify/instagram-post-scraper';
const TIKTOK_ACTOR = 'clockworks/tiktok-scraper';
const CHILD_TIMEOUT_SECS = 600;

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalizeInstagram(item: Record<string, unknown>): UnifiedPost | null {
    if (item.error) return null;
    const images = Array.isArray(item.images) ? (item.images as string[]) : [];
    const displayUrl = str(item.displayUrl);
    const isVideo = str(item.type) === 'Video';
    const photos = isVideo ? [] : images.length > 1 ? images : ([displayUrl || images[0]].filter(Boolean) as string[]);
    const videos = str(item.videoUrl) ? [str(item.videoUrl)] : [];
    const music = (item.musicInfo ?? {}) as Record<string, unknown>;
    const audioName = str(music.song_name) || null;
    const audioArtist = str(music.artist_name) || null;
    return {
        platform: 'instagram',
        sourceProfile: str(item.ownerUsername),
        postUrl: str(item.url),
        postId: str(item.id || item.shortCode),
        postedAt: str(item.timestamp) || null,
        caption: str(item.caption),
        photos: photos.length ? photos : images,
        videos,
        audioName,
        audioArtist,
        location: str(item.locationName) || null,
        locationId: num(item.locationId),
        videoDurationSecs: num(item.videoDuration),
        likes: num(item.likesCount),
        comments: num(item.commentsCount),
        views: num(item.videoPlayCount) ?? num(item.videoViewCount),
        thumbnailUrl: isVideo ? displayUrl || null : null,
        authorAvatarUrl: null, // the Instagram post scraper doesn't return profile pictures
    };
}

function normalizeTikTok(item: Record<string, unknown>): UnifiedPost | null {
    if (item.error) return null;
    const author = (item.authorMeta ?? {}) as Record<string, unknown>;
    const video = (item.videoMeta ?? {}) as Record<string, unknown>;
    const music = (item.musicMeta ?? {}) as Record<string, unknown>;
    const slides = Array.isArray(item.slideshowImageLinks)
        ? (item.slideshowImageLinks as Array<Record<string, unknown>>).map((s) => str(s.downloadLink)).filter(Boolean)
        : [];
    const downloadAddr = str(video.downloadAddr);
    return {
        platform: 'tiktok',
        sourceProfile: str(author.name),
        postUrl: str(item.webVideoUrl),
        postId: str(item.id),
        postedAt: str(item.createTimeISO) || null,
        caption: str(item.text),
        photos: slides,
        videos: downloadAddr ? [downloadAddr] : [],
        audioName: str(music.musicName) || null,
        audioArtist: str(music.musicAuthor) || null,
        location: null,
        locationId: null,
        videoDurationSecs: num(video.duration),
        likes: num(item.diggCount),
        comments: num(item.commentCount),
        views: num(item.playCount),
        thumbnailUrl: str(video.coverUrl) || str(video.originalCoverUrl) || null,
        authorAvatarUrl: str(author.originalAvatarUrl) || str(author.avatar) || null,
    };
}

await Actor.init();

try {
    const input = ((await Actor.getInput<Input>()) ?? {}) as Input;
    const instagramUsernames = input.instagramUsernames ?? ['fcbarcelona'];
    const tiktokProfiles = input.tiktokProfiles ?? ['fcbarcelona'];
    const resultsPerSource = input.resultsPerSource ?? 10;
    const newerThan = input.newerThan ?? '7 days';

    log.info('Starting Instagram and TikTok scrapers in parallel', {
        instagramUsernames,
        tiktokProfiles,
        resultsPerSource,
        newerThan,
    });

    const skip = Promise.resolve(null);
    const [igRun, ttRun] = await Promise.all([
        instagramUsernames.length === 0 ? skip : Actor.call(
            INSTAGRAM_ACTOR,
            {
                username: instagramUsernames,
                resultsLimit: resultsPerSource,
                onlyPostsNewerThan: newerThan,
                dataDetailLevel: 'detailedData',
            },
            { timeout: CHILD_TIMEOUT_SECS },
        ),
        tiktokProfiles.length === 0 ? skip : Actor.call(
            TIKTOK_ACTOR,
            {
                profiles: tiktokProfiles,
                resultsPerPage: resultsPerSource,
                oldestPostDateUnified: newerThan,
                profileSorting: 'latest',
                shouldDownloadVideos: false,
            },
            { timeout: CHILD_TIMEOUT_SECS },
        ),
    ]);

    const failures: string[] = [];
    if (igRun && igRun.status !== 'SUCCEEDED') failures.push(`Instagram run ${igRun.id} ended ${igRun.status}`);
    if (ttRun && ttRun.status !== 'SUCCEEDED') failures.push(`TikTok run ${ttRun.id} ended ${ttRun.status}`);
    if (failures.length) {
        throw new Error(failures.join('; '));
    }

    const items = async (run: { defaultDatasetId: string } | null) =>
        run ? ((await Actor.apifyClient.dataset(run.defaultDatasetId).listItems()).items as Record<string, unknown>[]) : [];
    const igItems = await items(igRun);
    const ttItems = await items(ttRun);

    const posts: UnifiedPost[] = [
        ...igItems.map(normalizeInstagram).filter((p): p is UnifiedPost => p !== null),
        ...ttItems.map(normalizeTikTok).filter((p): p is UnifiedPost => p !== null),
    ];

    await Actor.pushData(posts);
    log.info(`Saved ${posts.length} posts (${igItems.length} Instagram raw, ${ttItems.length} TikTok raw)`);
} catch (err) {
    log.error(`Run failed: ${(err as Error).message}`);
    await Actor.fail((err as Error).message);
}

await Actor.exit();
