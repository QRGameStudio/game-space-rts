class GEOSelectable extends GEOSavable {
    static selectedId = null;

    selectObject() {
        if (SELECTED_OBJECT !== null) {
            SELECTED_OBJECT.constructor.selectedId = null;
        }
        this.constructor.selectedId = this.id;
        SELECTED_OBJECT = this;
    }
}
