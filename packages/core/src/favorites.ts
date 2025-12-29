/**
 * Connection Favorites Service
 * 연결 즐겨찾기 관리
 */

export interface FavoriteConnection {
    id: string;
    name: string;
    connectionId: string;
    password?: string;
    icon?: string;
    color?: string;
    lastConnected?: number;
    createdAt: number;
    tags?: string[];
}

export interface FavoritesSettings {
    autoSavePassword: boolean;
    sortBy: 'name' | 'lastConnected' | 'createdAt';
    maxFavorites: number;
}

const DEFAULT_SETTINGS: FavoritesSettings = {
    autoSavePassword: false,
    sortBy: 'lastConnected',
    maxFavorites: 50,
};

const COLORS = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
];

class FavoritesService {
    private favorites: FavoriteConnection[] = [];
    private settings: FavoritesSettings;
    private onFavoritesChange: ((favorites: FavoriteConnection[]) => void) | null = null;

    constructor() {
        this.settings = this.loadSettings();
        this.favorites = this.loadFavorites();
    }

    /**
     * 즐겨찾기 로드
     */
    private loadFavorites(): FavoriteConnection[] {
        const saved = localStorage.getItem('lunarview-favorites');
        return saved ? JSON.parse(saved) : [];
    }

    /**
     * 즐겨찾기 저장
     */
    private saveFavorites(): void {
        localStorage.setItem('lunarview-favorites', JSON.stringify(this.favorites));
        if (this.onFavoritesChange) {
            this.onFavoritesChange(this.favorites);
        }
    }

    /**
     * 설정 로드
     */
    private loadSettings(): FavoritesSettings {
        const saved = localStorage.getItem('lunarview-favorites-settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    }

    /**
     * 설정 저장
     */
    saveSettings(settings: Partial<FavoritesSettings>): void {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('lunarview-favorites-settings', JSON.stringify(this.settings));
    }

    /**
     * 즐겨찾기 추가
     */
    addFavorite(data: {
        name: string;
        connectionId: string;
        password?: string;
        tags?: string[];
    }): FavoriteConnection {
        if (this.favorites.length >= this.settings.maxFavorites) {
            throw new Error('Maximum favorites limit reached');
        }

        const existing = this.favorites.find(f => f.connectionId === data.connectionId);
        if (existing) {
            throw new Error('Connection already in favorites');
        }

        const favorite: FavoriteConnection = {
            id: this.generateId(),
            name: data.name,
            connectionId: data.connectionId,
            password: this.settings.autoSavePassword ? data.password : undefined,
            color: COLORS[this.favorites.length % COLORS.length],
            createdAt: Date.now(),
            tags: data.tags || [],
        };

        this.favorites.push(favorite);
        this.saveFavorites();

        return favorite;
    }

    /**
     * 즐겨찾기 삭제
     */
    removeFavorite(id: string): void {
        this.favorites = this.favorites.filter(f => f.id !== id);
        this.saveFavorites();
    }

    /**
     * 즐겨찾기 수정
     */
    updateFavorite(id: string, updates: Partial<Omit<FavoriteConnection, 'id' | 'createdAt'>>): FavoriteConnection | null {
        const index = this.favorites.findIndex(f => f.id === id);
        if (index === -1) return null;

        this.favorites[index] = { ...this.favorites[index], ...updates };
        this.saveFavorites();

        return this.favorites[index];
    }

    /**
     * 마지막 연결 시간 업데이트
     */
    updateLastConnected(connectionId: string): void {
        const favorite = this.favorites.find(f => f.connectionId === connectionId);
        if (favorite) {
            favorite.lastConnected = Date.now();
            this.saveFavorites();
        }
    }

    /**
     * 즐겨찾기 목록 가져오기
     */
    getFavorites(): FavoriteConnection[] {
        const sorted = [...this.favorites];

        switch (this.settings.sortBy) {
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'lastConnected':
                sorted.sort((a, b) => (b.lastConnected || 0) - (a.lastConnected || 0));
                break;
            case 'createdAt':
                sorted.sort((a, b) => b.createdAt - a.createdAt);
                break;
        }

        return sorted;
    }

    /**
     * ID로 즐겨찾기 찾기
     */
    getFavoriteById(id: string): FavoriteConnection | undefined {
        return this.favorites.find(f => f.id === id);
    }

    /**
     * 연결 ID로 즐겨찾기 찾기
     */
    getFavoriteByConnectionId(connectionId: string): FavoriteConnection | undefined {
        return this.favorites.find(f => f.connectionId === connectionId);
    }

    /**
     * 태그로 검색
     */
    searchByTag(tag: string): FavoriteConnection[] {
        return this.favorites.filter(f => f.tags?.includes(tag));
    }

    /**
     * 이름으로 검색
     */
    searchByName(query: string): FavoriteConnection[] {
        const lower = query.toLowerCase();
        return this.favorites.filter(f =>
            f.name.toLowerCase().includes(lower) ||
            f.connectionId.includes(query)
        );
    }

    /**
     * 즐겨찾기 여부 확인
     */
    isFavorite(connectionId: string): boolean {
        return this.favorites.some(f => f.connectionId === connectionId);
    }

    /**
     * 즐겨찾기 개수
     */
    getCount(): number {
        return this.favorites.length;
    }

    /**
     * 설정 가져오기
     */
    getSettings(): FavoritesSettings {
        return { ...this.settings };
    }

    /**
     * 변경 리스너
     */
    onChanged(callback: (favorites: FavoriteConnection[]) => void): void {
        this.onFavoritesChange = callback;
    }

    /**
     * 내보내기 (백업)
     */
    export(): string {
        return JSON.stringify({
            favorites: this.favorites,
            settings: this.settings,
            exportedAt: Date.now(),
        }, null, 2);
    }

    /**
     * 가져오기 (복원)
     */
    import(jsonString: string): void {
        try {
            const data = JSON.parse(jsonString);
            if (data.favorites) {
                this.favorites = data.favorites;
                this.saveFavorites();
            }
            if (data.settings) {
                this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
                this.saveSettings(this.settings);
            }
        } catch (error) {
            throw new Error('Invalid import data');
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

// 싱글톤 인스턴스
let instance: FavoritesService | null = null;

export function getFavoritesService(): FavoritesService {
    if (!instance) {
        instance = new FavoritesService();
    }
    return instance;
}

export default FavoritesService;
