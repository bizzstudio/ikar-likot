import { create } from 'zustand'

const useLoadingStore = create((set) => ({
    text: 'loadingOrders',
    setText: (newText) => set({ text: newText }),
}));

export default useLoadingStore;